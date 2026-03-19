/**
 * Data loader — fetches static JSON data files.
 * All functions accept a baseUrl so they work both in dev and production
 * (where the site may be served under a subpath like /cooperforte-simulator).
 */

/**
 * Load Cooperforte rates (investimentos, emprestimos, sobras, ir_regressivo).
 * @param {string} baseUrl — e.g. '' or '/cooperforte-simulator'
 * @returns {Promise<Object>}
 */
export async function loadCooperforteRates(baseUrl = '') {
  try {
    const url = `${baseUrl}/data/cooperforte-rates.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load cooperforte-rates.json: ${res.status}`);
    return res.json();
  } catch (err) {
    console.error('loadCooperforteRates failed:', err);
    return null;
  }
}

/**
 * Load Focus projections (Selic + IPCA per year).
 * @param {string} baseUrl
 * @returns {Promise<Object>}
 */
export async function loadFocusData(baseUrl = '') {
  try {
    const url = `${baseUrl}/data/focus.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load focus.json: ${res.status}`);
    return res.json();
  } catch (err) {
    console.error('loadFocusData failed:', err);
    return null;
  }
}

/**
 * Load last-updated metadata.
 * @param {string} baseUrl
 * @returns {Promise<Object>}
 */
export async function loadLastUpdated(baseUrl = '') {
  try {
    const url = `${baseUrl}/data/last-updated.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load last-updated.json: ${res.status}`);
    return res.json();
  } catch (err) {
    console.error('loadLastUpdated failed:', err);
    return null;
  }
}

/**
 * Check whether the data is stale (older than maxDays).
 * @param {Object} lastUpdated — object with a `timestamp` ISO string
 * @param {number} maxDays — threshold in days (default 7)
 * @returns {boolean} true if data is stale
 */
export function isDataStale(lastUpdated, maxDays = 7) {
  if (!lastUpdated || !lastUpdated.timestamp) return true;
  const updatedMs = new Date(lastUpdated.timestamp).getTime();
  if (Number.isNaN(updatedMs)) return true;
  const ageMs = Date.now() - updatedMs;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > maxDays;
}
