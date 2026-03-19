#!/usr/bin/env python3
"""
Scrape Cooperforte website for investment and loan rates.

3-level fallback:
  - success:  update all fields in cooperforte-rates.json
  - partial:  update only the fields that were found
  - failure:  keep existing JSON untouched

Always exits 0 so CI pipelines are never broken.
"""

import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "public" / "data"
RATES_FILE = DATA_DIR / "cooperforte-rates.json"
LAST_UPDATED_FILE = DATA_DIR / "last-updated.json"

CREDIT_URL = "https://cf.coop.br/produtos-e-diferenciais/credito/"
INVESTMENT_URL = "https://cf.coop.br/investimentos/"
INVESTMENT_URL_FALLBACK = "https://cf.coop.br/produtos-e-beneficios/"

HEADERS = {
    "User-Agent": "CooperforteSimulator/1.0 (github.com/josesiqueira/simulador-cooperforte)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.5,en;q=0.3",
}

TIMEOUT = 15  # seconds

# Validation ranges
MIN_MONTHLY_RATE = 0.5
MAX_MONTHLY_RATE = 5.0
MIN_CDI_PCT = 80.0
MAX_CDI_PCT = 130.0

# Regex patterns
RE_MONTHLY_RATE = re.compile(r"(\d{1,2}[,\.]\d{2})\s*%\s*a\.?\s*m\.?", re.IGNORECASE)
RE_ANNUAL_RATE = re.compile(r"(\d{1,2}[,\.]\d{2})\s*%\s*a\.?\s*a\.?", re.IGNORECASE)
RE_CDI_PERCENT = re.compile(r"(\d{2,3}[,\.]?\d{0,2})\s*%\s*(?:do\s+)?CDI", re.IGNORECASE)
RE_CDI_SPREAD = re.compile(r"CDI\s*\+\s*(\d{1,2}[,\.]\d{2})\s*%", re.IGNORECASE)

# Validation for annual prefixed rates
MIN_ANNUAL_RATE = 5.0
MAX_ANNUAL_RATE = 25.0

# Keyword-to-field mapping for loan products
LOAN_KEYWORDS = {
    "consignado": "consignado_direto",
    "portabilidade": "consignado_portabilidade",
    "multicr[eé]dito": "multicredito",
    "multicrédito": "multicredito",
    "cr[eé]dito inicial": "credito_inicial",
    "crédito inicial": "credito_inicial",
    "garantido": "credito_garantido",
    "credcooper": "credcooper40",
    "trabalhador": "credito_trabalhador",
}

# Compiled keyword patterns (order matters: more specific first)
LOAN_PATTERNS = [
    (re.compile(r"portabilidade", re.IGNORECASE), "consignado_portabilidade"),
    (re.compile(r"cr[eé]dito\s+inicial", re.IGNORECASE), "credito_inicial"),
    (re.compile(r"multicr[eé]dito", re.IGNORECASE), "multicredito"),
    (re.compile(r"garantido", re.IGNORECASE), "credito_garantido"),
    (re.compile(r"credcooper", re.IGNORECASE), "credcooper40"),
    (re.compile(r"trabalhador", re.IGNORECASE), "credito_trabalhador"),
    # consignado is generic — must come last so more specific patterns match first
    (re.compile(r"consignado", re.IGNORECASE), "consignado_direto"),
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("scrape-cooperforte")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_existing_rates() -> dict:
    """Load the current cooperforte-rates.json as fallback base."""
    try:
        with open(RATES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        logger.warning("Could not load existing rates file: %s", exc)
        return {}


def save_rates(data: dict) -> None:
    """Write cooperforte-rates.json."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(RATES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    logger.info("Saved rates to %s", RATES_FILE)


def update_last_updated(status: str, source: str = "cf.coop.br") -> None:
    """Write last-updated.json with current timestamp and status."""
    payload = {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": source,
        "status": status,
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(LAST_UPDATED_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    logger.info("Updated last-updated.json: status=%s", status)


def parse_br_number(text: str) -> float:
    """Convert a Brazilian-format number string to float. '1,49' -> 1.49"""
    return float(text.replace(",", "."))


def validate_monthly_rate(value: float) -> bool:
    """Check if a monthly rate is within plausible range."""
    return MIN_MONTHLY_RATE <= value <= MAX_MONTHLY_RATE


def validate_cdi_pct(value: float) -> bool:
    """Check if a CDI percentage is within plausible range."""
    return MIN_CDI_PCT <= value <= MAX_CDI_PCT


def fetch_page(url: str) -> BeautifulSoup | None:
    """Fetch a URL and return parsed BeautifulSoup, or None on failure."""
    try:
        logger.info("Fetching %s", url)
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "lxml")
    except requests.RequestException as exc:
        logger.error("Failed to fetch %s: %s", url, exc)
        return None


# ---------------------------------------------------------------------------
# Extraction logic
# ---------------------------------------------------------------------------

def extract_loan_rates(soup: BeautifulSoup) -> dict[str, float]:
    """
    Walk through text blocks in the page and try to associate monthly rates
    with known loan product keywords.

    Returns a dict like {"consignado_direto": 1.49, "multicredito": 2.19, ...}
    """
    found: dict[str, float] = {}

    # Strategy: look at each text node's parent context for keyword + rate pairs.
    # We search sections, divs, paragraphs, list items, table cells.
    for element in soup.find_all(["section", "div", "p", "li", "td", "span", "h2", "h3", "h4"]):
        text = element.get_text(separator=" ", strip=True)
        if not text or len(text) > 2000:
            continue

        # Find all monthly rates in this block
        rate_matches = RE_MONTHLY_RATE.findall(text)
        if not rate_matches:
            continue

        # Try to match a product keyword
        for pattern, field_name in LOAN_PATTERNS:
            if pattern.search(text):
                for rate_str in rate_matches:
                    rate_val = parse_br_number(rate_str)
                    if validate_monthly_rate(rate_val):
                        if field_name not in found:
                            found[field_name] = rate_val
                            logger.info(
                                "Found loan rate: %s = %.2f%% a.m. (from text: %.80s...)",
                                field_name, rate_val, text,
                            )
                        break
                break  # first matching keyword wins for this block

    return found


def extract_investment_rates(soup: BeautifulSoup) -> dict:
    """
    Extract CDI percentages, CDI+spread values, and prefixed annual rates
    from investment pages.

    Returns a dict like:
        {"cdi_pct": {field: value}, "cdi_spread": {field: value}, "lfc_pre_taxa_aa": float|None}
    """
    cdi_pcts: dict[str, float] = {}
    cdi_spreads: dict[str, float] = {}
    lfc_pre_taxa: float | None = None

    for element in soup.find_all(["section", "div", "p", "li", "td", "span", "h2", "h3", "h4"]):
        text = element.get_text(separator=" ", strip=True)
        if not text or len(text) > 2000:
            continue

        text_lower = text.lower()

        # CDI percentage (e.g., "100% do CDI")
        pct_matches = RE_CDI_PERCENT.findall(text)
        for pct_str in pct_matches:
            pct_val = parse_br_number(pct_str)
            if validate_cdi_pct(pct_val):
                logger.info("Found CDI pct: %.1f%% CDI (text: %.80s...)", pct_val, text)
                if "cdi_generic" not in cdi_pcts:
                    cdi_pcts["cdi_generic"] = pct_val

        # CDI + spread (e.g., "CDI + 0,40%") — try to associate with product
        spread_matches = RE_CDI_SPREAD.findall(text)
        for spread_str in spread_matches:
            spread_val = parse_br_number(spread_str)
            if 0.0 < spread_val <= 2.0:
                # Try to identify which product this spread belongs to
                product_key = None
                if "rdc-sq" in text_lower or "super qualificad" in text_lower:
                    product_key = "rdc_sq"
                elif "rdc-q" in text_lower or "qualificad" in text_lower:
                    product_key = "rdc_q"
                elif "lfc" in text_lower or "letra financeira" in text_lower:
                    if "pós" in text_lower or "pos" in text_lower or "pós-fix" in text_lower:
                        product_key = "lfc_pos"
                if product_key and product_key not in cdi_spreads:
                    cdi_spreads[product_key] = spread_val
                    logger.info("Found CDI spread for %s: +%.2f%% (text: %.80s...)", product_key, spread_val, text)
                elif product_key is None and "spread_generic" not in cdi_spreads:
                    cdi_spreads["spread_generic"] = spread_val
                    logger.info("Found CDI spread (generic): +%.2f%% (text: %.80s...)", spread_val, text)

        # LFC Pre — look for annual rate near "lfc" and "pre" or "prefixad" keywords
        # Also match blocks that mention "pre" + "% a.a" without CDI (it's a fixed rate)
        if lfc_pre_taxa is None and ("lfc" in text_lower or "letra financeira" in text_lower):
            if "pr" in text_lower and ("fix" in text_lower or "% a" in text_lower):
                annual_matches = RE_ANNUAL_RATE.findall(text)
                for rate_str in annual_matches:
                    rate_val = parse_br_number(rate_str)
                    if MIN_ANNUAL_RATE <= rate_val <= MAX_ANNUAL_RATE:
                        # Make sure this isn't a CDI+spread (those have "CDI" nearby)
                        if "cdi" not in text_lower.split(rate_str.replace(",", "."))[0][-30:]:
                            lfc_pre_taxa = rate_val
                            logger.info(
                                "Found LFC Pre rate: %.2f%% a.a. (text: %.80s...)",
                                rate_val, text,
                            )
                            break

        # Fallback: if we see "Pré-fixado" or "Prefixado" near an annual rate in LFC context
        if lfc_pre_taxa is None and ("pré" in text_lower or "pre" in text_lower or "prefixad" in text_lower):
            if "lfc" in text_lower or "letra" in text_lower:
                annual_matches = RE_ANNUAL_RATE.findall(text)
                for rate_str in annual_matches:
                    rate_val = parse_br_number(rate_str)
                    if MIN_ANNUAL_RATE <= rate_val <= MAX_ANNUAL_RATE:
                        lfc_pre_taxa = rate_val
                        logger.info(
                            "Found LFC Pre rate (fallback): %.2f%% a.a. (text: %.80s...)",
                            rate_val, text,
                        )
                        break

    return {"cdi_pct": cdi_pcts, "cdi_spread": cdi_spreads, "lfc_pre_taxa_aa": lfc_pre_taxa}


def apply_loan_rates(rates: dict, found_rates: dict[str, float]) -> int:
    """
    Merge found loan rates into the existing rates dict.
    Returns number of fields updated.
    """
    updated = 0
    emprestimos = rates.get("emprestimos", {})

    for field_name, rate_value in found_rates.items():
        if field_name in emprestimos:
            old_val = emprestimos[field_name].get("taxa_am")
            emprestimos[field_name]["taxa_am"] = rate_value
            updated += 1
            logger.info(
                "Updated emprestimos.%s.taxa_am: %s -> %.2f",
                field_name, old_val, rate_value,
            )

    return updated


def apply_investment_rates(rates: dict, inv_data: dict) -> int:
    """
    Merge found investment rates into existing rates dict.
    Returns number of fields updated.
    """
    updated = 0
    investimentos = rates.get("investimentos", {})

    cdi_pcts = inv_data.get("cdi_pct", {})
    cdi_spreads = inv_data.get("cdi_spread", {})

    # If we found a generic CDI percentage, apply to products that use taxa_cdi_pct
    if "cdi_generic" in cdi_pcts:
        val = cdi_pcts["cdi_generic"]
        for product_key in ["rdc_i", "rdc_q", "rdc_sq", "lfc_pos"]:
            if product_key in investimentos and "taxa_cdi_pct" in investimentos[product_key]:
                old = investimentos[product_key]["taxa_cdi_pct"]
                investimentos[product_key]["taxa_cdi_pct"] = val
                updated += 1
                logger.info(
                    "Updated investimentos.%s.taxa_cdi_pct: %s -> %.1f",
                    product_key, old, val,
                )

    # Apply CDI spreads — prefer product-specific, fall back to generic
    for product_key in ["rdc_q", "rdc_sq", "lfc_pos"]:
        spread_pct = cdi_spreads.get(product_key) or cdi_spreads.get("spread_generic")
        if spread_pct is not None and product_key in investimentos and "spread_aa" in investimentos[product_key]:
            old = investimentos[product_key]["spread_aa"]
            investimentos[product_key]["spread_aa"] = spread_pct
            updated += 1
            logger.info(
                "Updated investimentos.%s.spread_aa: %s -> %.2f",
                product_key, old, spread_pct,
            )

    # LFC Pre annual rate
    lfc_pre_taxa = inv_data.get("lfc_pre_taxa_aa")
    if lfc_pre_taxa is not None and "lfc_pre" in investimentos:
        old = investimentos["lfc_pre"].get("taxa_aa")
        investimentos["lfc_pre"]["taxa_aa"] = lfc_pre_taxa
        updated += 1
        logger.info(
            "Updated investimentos.lfc_pre.taxa_aa: %s -> %.2f",
            old, lfc_pre_taxa,
        )

    return updated


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    logger.info("Starting Cooperforte rate scraping")

    # Step 1: load existing rates as fallback base
    rates = load_existing_rates()
    if not rates:
        logger.warning("No existing rates file found; nothing to update as fallback")
        update_last_updated("scrape_failed_no_base", source="scrape-cooperforte.py")
        return

    total_updated = 0
    scrape_ok = True

    # Step 2: scrape credit page for loan rates
    credit_soup = fetch_page(CREDIT_URL)
    if credit_soup:
        loan_rates = extract_loan_rates(credit_soup)
        if loan_rates:
            count = apply_loan_rates(rates, loan_rates)
            total_updated += count
            logger.info("Applied %d loan rate updates", count)
        else:
            logger.warning("No loan rates extracted from credit page")
    else:
        scrape_ok = False
        logger.warning("Credit page fetch failed")

    # Step 3: scrape investment page (try primary URL, then fallback)
    inv_soup = fetch_page(INVESTMENT_URL)
    if inv_soup is None:
        logger.info("Primary investment URL failed, trying fallback: %s", INVESTMENT_URL_FALLBACK)
        inv_soup = fetch_page(INVESTMENT_URL_FALLBACK)
    if inv_soup:
        inv_data = extract_investment_rates(inv_soup)
        has_inv = bool(inv_data.get("cdi_pct") or inv_data.get("cdi_spread"))
        if has_inv:
            count = apply_investment_rates(rates, inv_data)
            total_updated += count
            logger.info("Applied %d investment rate updates", count)
        else:
            logger.warning("No investment rates extracted from investment page")
    else:
        scrape_ok = False
        logger.warning("Investment page fetch failed")

    # Step 4: determine status and save
    if total_updated > 0:
        # Update timestamp on the rates JSON itself
        rates["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        rates["source"] = "cf.coop.br"
        save_rates(rates)

        if scrape_ok:
            status = "success"
        else:
            status = "partial"
        logger.info("Scraping finished: %d fields updated, status=%s", total_updated, status)
    else:
        # No updates found — keep existing JSON untouched
        if not scrape_ok:
            status = "scrape_failed"
        else:
            status = "no_changes"
        logger.info("Scraping finished: no updates applied, status=%s", status)

    update_last_updated(status)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("Unexpected error in scrape-cooperforte.py")
        try:
            update_last_updated("scrape_error")
        except Exception:
            logger.exception("Failed to update last-updated.json after error")
    # Always exit 0 — never break the CI pipeline
    sys.exit(0)
