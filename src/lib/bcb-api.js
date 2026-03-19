/**
 * BCB (Banco Central do Brasil) API client.
 *
 * Fetches Selic, CDI, and TR from the public SGS API.
 * Uses sessionStorage cache (1 hour TTL) and hardcoded fallbacks
 * to ensure the UI always has data, even when the API is down.
 */

const BCB_BASE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 5000; // 5 seconds

/** @type {Record<number, {data: string, valor: string}>} */
const FALLBACK_VALUES = {
  432:  { data: '18/03/2026', valor: '14.900' },
  4389: { data: '18/03/2026', valor: '14.890' },
  226:  { data: '18/03/2026', valor: '0.090' },
};

/**
 * Try to read a cached value from sessionStorage.
 * @param {number} serieId
 * @returns {{data: string, valor: string} | null}
 */
function readCache(serieId) {
  try {
    const raw = sessionStorage.getItem(`bcb_${serieId}`);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached._ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(`bcb_${serieId}`);
      return null;
    }
    return { data: cached.data, valor: cached.valor };
  } catch {
    return null;
  }
}

/**
 * Write a value to sessionStorage cache.
 * @param {number} serieId
 * @param {{data: string, valor: string}} value
 */
function writeCache(serieId, value) {
  try {
    sessionStorage.setItem(
      `bcb_${serieId}`,
      JSON.stringify({ ...value, _ts: Date.now() }),
    );
  } catch {
    // sessionStorage may be unavailable (SSR, private mode quota, etc.)
  }
}

/**
 * Fetch a single BCB SGS serie.
 * 1. Check sessionStorage cache (1h TTL)
 * 2. Fetch with 5s timeout via AbortController
 * 3. On failure, return hardcoded fallback
 *
 * @param {number} serieId
 * @returns {Promise<{data: string, valor: string}>}
 */
async function fetchBCBSerie(serieId) {
  // 1. Cache hit?
  const cached = readCache(serieId);
  if (cached) return cached;

  // 2. Fetch from API
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = `${BCB_BASE}.${serieId}/dados/ultimos/1?formato=json`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (Array.isArray(json) && json.length > 0) {
      const value = { data: json[0].data, valor: json[0].valor };
      writeCache(serieId, value);
      return value;
    }
    throw new Error('Empty response');
  } catch {
    // 3. Fallback
    return FALLBACK_VALUES[serieId] || { data: '', valor: '0' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch current Selic rate (serie 432).
 * @returns {Promise<{data: string, valor: string}>}
 */
export function fetchSelic() {
  return fetchBCBSerie(432);
}

/**
 * Fetch current CDI rate (serie 4389).
 * @returns {Promise<{data: string, valor: string}>}
 */
export function fetchCDI() {
  return fetchBCBSerie(4389);
}

/**
 * Fetch current TR rate (serie 226).
 * @returns {Promise<{data: string, valor: string}>}
 */
export function fetchTR() {
  return fetchBCBSerie(226);
}
