/**
 * Formatting utilities — pt-BR locale, BRL currency, percentages, dates.
 */

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Format a number as BRL currency.
 * @param {number} valor
 * @returns {string} e.g. "R$ 200.000,00"
 */
export function formatBRL(valor) {
  return brlFormatter.format(valor);
}

/**
 * Format a number as a percentage string.
 * @param {number} valor — the numeric value (e.g. 14.9 for 14,90%)
 * @param {number} casas — decimal places (default 2)
 * @returns {string} e.g. "14,90%"
 */
export function formatPercent(valor, casas = 2) {
  const safeCasas = Math.max(0, Math.floor(casas));
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: safeCasas,
    maximumFractionDigits: safeCasas,
  }).format(valor);
  return `${formatted}%`;
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Format an ISO date string to pt-BR format.
 * @param {string} isoString — e.g. "2026-03-18T12:00:00Z"
 * @returns {string} e.g. "18/03/2026"
 */
export function formatDate(isoString) {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '—';
    return dateFormatter.format(d);
  } catch {
    return '—';
  }
}

/**
 * Format a number with pt-BR locale.
 * @param {number} valor
 * @param {number} casas — decimal places (default 2)
 * @returns {string} e.g. "200.000,00"
 */
export function formatNumber(valor, casas = 2) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
}

/**
 * Parse a pt-BR formatted currency/number string back to a number.
 * Handles inputs like "200.000,00" or "R$ 200.000,00".
 * @param {string} str
 * @returns {number}
 */
export function parseBRLInput(str) {
  if (typeof str !== 'string') return NaN;
  // Remove currency symbol, spaces, and non-breaking spaces
  const cleaned = str
    .replace(/R\$\s*/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')    // remove thousand separators
    .replace(',', '.');    // convert decimal comma to dot
  return parseFloat(cleaned);
}
