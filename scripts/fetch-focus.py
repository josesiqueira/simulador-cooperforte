#!/usr/bin/env python3
"""
Fetch Focus market projections (Selic and IPCA) from the BCB OLINDA API.

Writes public/data/focus.json with the latest median projections per year.

Fallback: on any error, keeps the existing focus.json untouched and exits 0.
"""

import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "public" / "data"
FOCUS_FILE = DATA_DIR / "focus.json"
LAST_UPDATED_FILE = DATA_DIR / "last-updated.json"

OLINDA_BASE = (
    "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/"
    "ExpectativasMercadoAnuais"
)

HEADERS = {
    "User-Agent": "CooperforteSimulator/1.0 (github.com/josesiqueira/simulador-cooperforte)",
    "Accept": "application/json",
}

TIMEOUT = 30  # seconds
MAX_RETRIES = 2  # first attempt + 1 retry
RETRY_BACKOFF = 5  # seconds

# Validation ranges
SELIC_MIN = 5.0
SELIC_MAX = 25.0
IPCA_MIN = 1.0
IPCA_MAX = 15.0

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("fetch-focus")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_url(indicator: str, current_year: int) -> str:
    """Build the OLINDA OData query URL for a given indicator."""
    filter_clause = (
        f"Indicador eq '{indicator}' and DataReferencia ge '{current_year}'"
    )
    return (
        f"{OLINDA_BASE}"
        f"?$filter={filter_clause}"
        f"&$orderby=Data desc"
        f"&$top=200"
        f"&$format=json"
    )


def fetch_with_retry(url: str) -> dict | None:
    """Fetch a URL with one retry on failure."""
    for attempt in range(MAX_RETRIES):
        try:
            logger.info("Fetching %s (attempt %d/%d)", url[:120], attempt + 1, MAX_RETRIES)
            resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            logger.error("Request failed (attempt %d): %s", attempt + 1, exc)
            if attempt < MAX_RETRIES - 1:
                logger.info("Retrying in %ds...", RETRY_BACKOFF)
                time.sleep(RETRY_BACKOFF)
    return None


def extract_projections(data: dict, value_field: str) -> dict[str, float]:
    """
    From the OLINDA API response, group by DataReferencia (year),
    take the most recent record per year (sorted by Data desc),
    and extract the Mediana value.

    Returns: {"2026": 12.25, "2027": 10.50, ...}
    """
    records = data.get("value", [])
    if not records:
        logger.warning("No records in API response")
        return {}

    # Group by DataReferencia (which is the projection target year)
    by_year: dict[str, list] = {}
    for record in records:
        year_ref = str(record.get("DataReferencia", ""))
        if not year_ref:
            continue
        by_year.setdefault(year_ref, []).append(record)

    projections: dict[str, float] = {}
    for year, year_records in sorted(by_year.items()):
        # Records are already ordered by Data desc from the API,
        # but sort locally to be safe
        year_records.sort(key=lambda r: r.get("Data", ""), reverse=True)
        most_recent = year_records[0]
        median = most_recent.get("Mediana")
        if median is not None:
            projections[year] = float(median)
            logger.info(
                "%s %s: Mediana=%.2f (Data=%s)",
                value_field, year, median, most_recent.get("Data", "?"),
            )

    return projections


def validate_selic(value: float) -> bool:
    return SELIC_MIN <= value <= SELIC_MAX


def validate_ipca(value: float) -> bool:
    return IPCA_MIN <= value <= IPCA_MAX


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    logger.info("Starting Focus projections fetch")

    current_year = datetime.now(timezone.utc).year

    # Fetch Selic projections
    selic_url = build_url("Selic", current_year)
    selic_data = fetch_with_retry(selic_url)

    if selic_data is None:
        logger.error("Failed to fetch Selic projections after retries")
        logger.info("Keeping existing focus.json")
        return

    selic_proj = extract_projections(selic_data, "Selic")

    # Fetch IPCA projections
    ipca_url = build_url("IPCA", current_year)
    ipca_data = fetch_with_retry(ipca_url)

    if ipca_data is None:
        logger.error("Failed to fetch IPCA projections after retries")
        logger.info("Keeping existing focus.json")
        return

    ipca_proj = extract_projections(ipca_data, "IPCA")

    # Validate and build output
    if not selic_proj and not ipca_proj:
        logger.warning("No projections extracted for either Selic or IPCA")
        logger.info("Keeping existing focus.json")
        return

    # Merge into the focus.json format
    all_years = sorted(set(list(selic_proj.keys()) + list(ipca_proj.keys())))

    projecoes: dict[str, dict] = {}
    valid_count = 0

    for year in all_years:
        entry: dict[str, float] = {}

        if year in selic_proj:
            selic_val = selic_proj[year]
            if validate_selic(selic_val):
                entry["selic_fim"] = round(selic_val, 2)
                valid_count += 1
            else:
                logger.warning(
                    "Selic projection for %s (%.2f) out of range [%.1f, %.1f] — skipped",
                    year, selic_val, SELIC_MIN, SELIC_MAX,
                )

        if year in ipca_proj:
            ipca_val = ipca_proj[year]
            if validate_ipca(ipca_val):
                entry["ipca"] = round(ipca_val, 2)
                valid_count += 1
            else:
                logger.warning(
                    "IPCA projection for %s (%.2f) out of range [%.1f, %.1f] — skipped",
                    year, ipca_val, IPCA_MIN, IPCA_MAX,
                )

        if entry:
            projecoes[year] = entry

    if valid_count == 0:
        logger.warning("All projections failed validation")
        logger.info("Keeping existing focus.json")
        return

    output = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "projecoes": projecoes,
    }

    # Write focus.json
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(FOCUS_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    logger.info(
        "Saved focus.json with %d years, %d valid projections",
        len(projecoes), valid_count,
    )

    # Update last-updated.json
    last_updated = {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "bcb-olinda",
        "status": "focus_updated",
    }
    with open(LAST_UPDATED_FILE, "w", encoding="utf-8") as f:
        json.dump(last_updated, f, indent=2, ensure_ascii=False)

    logger.info("Done")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("Unexpected error in fetch-focus.py")
    # Always exit 0 — never break the CI pipeline
    sys.exit(0)
