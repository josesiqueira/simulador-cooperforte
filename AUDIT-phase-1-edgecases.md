# Audit Report: Phase 1 -- Edge Cases, Error Handling & Input Validation

**Date**: 2026-03-19
**Auditor**: QA Engineer (automated + manual review)
**Scope**: `src/lib/calculator.js`, `src/lib/bcb-api.js`, `src/lib/data-loader.js`, `src/lib/formatters.js`
**Method**: Code review + runtime edge-case testing with Node 22

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH     | 5 |
| MEDIUM   | 6 |
| LOW      | 4 |

---

## 1. `src/lib/calculator.js`

### CRITICAL-01: `calcularIR` crashes when `diasCorridos` exceeds all brackets

**Location**: Line 44
**Issue**: `tabela.find()` returns `undefined` when no bracket matches. The next line `faixa.aliquota` throws `TypeError: Cannot read properties of undefined`.
**Triggers**: `diasCorridos > 999999`, `diasCorridos = NaN`, `diasCorridos = undefined`, or an empty `tabela` array.
**Impact**: Runtime crash in any code path that calls `calcularIR` with unexpected input.
**Fix**: Add a fallback after `find()`:

```js
const faixa = tabela.find(f => diasCorridos <= f.ate_dias)
  ?? tabela[tabela.length - 1];
if (!faixa) return { ir: 0, aliquota: 0, liquido: bruto };
```

### HIGH-01: `parcelaPrice` returns `Infinity` when `n=0`

**Location**: Line 180-181
**Issue**: When `taxa !== 0` and `n = 0`, the denominator `Math.pow(1 + taxa, 0) - 1 = 0`, causing division by zero producing `Infinity`. When `taxa === 0` and `n = 0`, returns `pv / 0 = Infinity`.
**Impact**: Infinity propagates through downstream calculations (IOF, CET), producing meaningless results in the UI.
**Fix**: Guard `n <= 0` at the top of the function:

```js
if (n <= 0) return 0; // or throw
```

### HIGH-02: `calcularIOF` accepts negative `parcelas`, producing negative IOF

**Location**: Line 196
**Issue**: `Math.min(parcelas * 30, 365)` with negative parcelas yields a negative number of days, making the daily IOF component negative. `calcularIOF(10000, -5) = -85`.
**Impact**: A negative IOF would reduce loan cost, which is nonsensical.
**Fix**: Clamp parcelas to non-negative: `Math.max(parcelas, 0)`.

### HIGH-03: `equivalenciaIsentoCDB` produces `Infinity` when `aliquotaIR = 1`

**Location**: Line 82
**Issue**: `taxaIsenta / (1 - 1)` = division by zero = `Infinity`. If `aliquotaIR > 1`, result is negative.
**Impact**: Could display Infinity or nonsensical negative equivalence in the UI.
**Fix**: Guard against `aliquotaIR >= 1`:

```js
if (aliquotaIR >= 1) return Infinity; // or throw
```

### HIGH-04: NaN propagation in `rendimentoPosFixado`

**Location**: Line 18-19
**Issue**: If any element in `cdiTrimestral` is `NaN`, the `fator` becomes `NaN`, and `bruto` becomes `NaN`. The return value `{ bruto: NaN, fator: NaN }` is serialized as `{ bruto: null, fator: null }` in JSON.
**Impact**: Silent data corruption -- downstream code receives nulls instead of numbers.
**Fix**: Validate each CDI value in the loop, or validate the input array up front.

### MEDIUM-01: `calcularCET` returns misleading results for degenerate inputs

**Location**: Lines 209-220
**Issue**: When `n = 0`, the inner loop never executes, `vp = 0 < valorRecebido` always, so `hi` collapses to `lo = 0.0001`. Returns `{ mensal: 0.0001, anual: 0.0012 }` which is meaningless. When `parcela = 0`, same behavior. When `valorRecebido = 0`, bisection converges to `hi = 0.15`, returning the upper bound.
**Impact**: Garbage output for edge inputs rather than an error signal.
**Fix**: Add guard clauses:

```js
if (n <= 0 || parcela <= 0 || valorRecebido <= 0) return { mensal: 0, anual: 0 };
```

### MEDIUM-02: `calcularCET` bisection bounds may be too narrow

**Location**: Line 211: `lo = 0.0001, hi = 0.15`
**Issue**: If the true CET exceeds 15% monthly (extreme predatory lending), the bisection will converge to the upper bound `0.15` and return an incorrect result. While unlikely for Cooperforte products, it is a silent failure.
**Fix**: Consider raising `hi` to `0.50` or adding a convergence check.

### MEDIUM-03: No input validation on any function

**Issue**: None of the 11 functions validate that their inputs are numbers (not `null`, `undefined`, `string`, etc.). JavaScript's loose typing means `rendimentoPreFixado("100000", "0.1325", "504")` silently works due to implicit coercion, but edge cases like `undefined` produce `NaN` silently.
**Impact**: Bugs become harder to trace when invalid data flows from the UI.
**Recommendation**: For a cooperativa simulator where inputs come from DOM elements, add `Number()` coercion or type checks at the entry points (the UI layer), not necessarily in these pure functions. Document the expectation that all inputs must be finite numbers.

### LOW-01: `custoComSobras` allows negative effective rates

**Location**: Line 238
**Issue**: If `devolucaoPP > taxaAnual`, `efetiva` becomes negative. `Math.pow(1 + (-0.1), 1/12) - 1` works mathematically but is economically nonsensical.
**Impact**: Unlikely in practice but could confuse users if displayed.

### LOW-02: `construirTrajetoria` interpolation anchoring is approximate

**Location**: Lines 106-111
**Issue**: The anchor calculation `(year - baseYear + 1) * 4` assumes the user is at the start of `baseYear`. If the current date is mid-year, the quarter-to-year mapping is off by up to 2 quarters.
**Impact**: Scenario trajectories may not align precisely with calendar quarters. Acceptable for a simulator but worth noting.

---

## 2. `src/lib/bcb-api.js`

### MEDIUM-04: sessionStorage unavailability handled correctly (PASS)

**Location**: Lines 25-37, 45-53
**Assessment**: Both `readCache` and `writeCache` wrap sessionStorage access in try/catch, returning `null` or silently failing. This handles Safari private mode, SSR, and quota exceeded scenarios correctly.

### MEDIUM-05: Non-JSON API response handled correctly (PASS)

**Location**: Line 79
**Assessment**: `res.json()` will throw if the body is not valid JSON, which is caught by the outer try/catch on line 86, falling through to the fallback. Correct.

### CRITICAL-02: Fallback for unknown serieId returns `{ data: '', valor: '0' }`

**Location**: Line 88
**Issue**: If `fetchBCBSerie` is called with an ID not in `FALLBACK_VALUES` (e.g., a typo or new serie), it returns `{ data: '', valor: '0' }`. The caller (`fetchSelic`, `fetchCDI`, `fetchTR`) only uses hardcoded IDs (432, 4389, 226) which all have fallbacks, so this is safe today. However, the generic `fetchBCBSerie` function could be used elsewhere and silently return zeros.
**Impact**: Low risk today, but the defensive `|| { data: '', valor: '0' }` should be documented as intentional.
**Recommendation**: Add a JSDoc note or consider logging a warning in the catch block.

### MEDIUM-06: AbortController timeout works correctly (PASS)

**Location**: Lines 71-72, 89-91
**Assessment**: `setTimeout` sets the abort after 5 seconds, `clearTimeout` runs in `finally`. If the fetch is aborted, the error is caught and fallback is returned. The `finally` block ensures no timer leak. Correct pattern.

### LOW-03: API response shape change not validated

**Location**: Lines 80-81
**Issue**: The code checks `Array.isArray(json) && json.length > 0` but assumes `json[0].data` and `json[0].valor` exist. If the BCB API changes field names, these would be `undefined`, cached as `{ data: undefined, valor: undefined }`, and returned to callers.
**Fix**: Add property existence check:

```js
if (Array.isArray(json) && json.length > 0 && json[0].data && json[0].valor) {
```

---

## 3. `src/lib/data-loader.js`

### HIGH-05: No error handling for malformed JSON

**Location**: Lines 16, 28, 40
**Issue**: `res.json()` will throw if the response body is not valid JSON. This error is not caught -- it propagates as an unhandled rejection. The `loadCooperforteRates`, `loadFocusData`, and `loadLastUpdated` functions all have this pattern.
**Impact**: If a JSON file is corrupted or the server returns HTML (e.g., a 404 page that returns 200), the application crashes with an unhelpful JSON parse error.
**Fix**: Either wrap in try/catch with a descriptive error, or document that callers must handle rejections. Since these are data-loading functions, a try/catch with fallback or rethrow with context would be better:

```js
try {
  return await res.json();
} catch {
  throw new Error(`Invalid JSON in cooperforte-rates.json`);
}
```

### PASS: `isDataStale` handles all edge cases correctly

**Assessment**: Tested with `null`, `undefined`, `{}`, invalid timestamps, future dates, `maxDays=0`, and `maxDays=-1`. All behave correctly. The `Number.isNaN` check on line 52 catches invalid date strings.

### LOW-04: No baseUrl validation

**Location**: Lines 12, 24, 36
**Issue**: If `baseUrl` contains a trailing slash, the URL becomes `//data/...` which may work or may not depending on the server. No validation or normalization.
**Fix**: Strip trailing slash: `baseUrl = baseUrl.replace(/\/+$/, '')`.

---

## 4. `src/lib/formatters.js`

### MEDIUM-07: `formatBRL`, `formatPercent`, `formatNumber` display "NaN" for invalid input

**Location**: Lines 16, 25-31, 55-60
**Issue**: Passing `NaN` or `undefined` produces strings like `"R$ NaN"`, `"NaN%"`, `"NaN"`. Passing `Infinity` produces `"R$ infinity"`. These are technically correct Intl.NumberFormat behavior but are ugly in the UI.
**Impact**: If upstream calculations produce NaN (see HIGH-04 above), the UI shows "R$ NaN" to users.
**Fix**: Add a guard:

```js
export function formatBRL(valor) {
  if (!Number.isFinite(valor)) return 'R$ --';
  return brlFormatter.format(valor);
}
```

### MEDIUM-08: `formatDate` crashes on invalid date strings

**Location**: Lines 46-47
**Issue**: `formatDate("")` and `formatDate("not-a-date")` throw `RangeError: Invalid time value` because `new Date("")` produces an invalid Date object.
**Impact**: If `lastUpdated.timestamp` or any other ISO string is empty/corrupt, calling `formatDate` will crash.
**Fix**: Add validation:

```js
export function formatDate(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '--/--/----';
  return dateFormatter.format(d);
}
```

### MEDIUM-09: `formatPercent` crashes when `casas` is negative

**Location**: Lines 26-30
**Issue**: `formatPercent(14.9, -1)` throws `RangeError: minimumFractionDigits value is out of range` because `Intl.NumberFormat` does not accept negative fraction digits.
**Impact**: Unlikely in practice but a potential crash if a caller passes a computed `casas` value.
**Fix**: Clamp: `casas = Math.max(0, casas)`.

### PASS: `parseBRLInput` handles garbage gracefully

**Assessment**: Returns `NaN` for `null`, `undefined`, non-string types, empty strings, and letter-only inputs. The `typeof str !== 'string'` guard on line 69 is effective.

### LOW-05: `parseBRLInput` only replaces first comma

**Location**: Line 75: `.replace(',', '.')`
**Issue**: `String.replace` with a string (not regex) only replaces the first occurrence. Input `"1.000,00,50"` becomes `"100000.50"` (silently drops `,50`). This is because `parseFloat("100000.50")` ignores trailing characters -- but the result `1000.005` is wrong because `parseFloat` stops at a valid number.
**Actually**: After removing dots: `"1000,00,50"` -> replace first comma: `"1000.00,50"` -> `parseFloat("1000.00,50")` = `1000` (stops at second comma). So `"1.000,00,50"` returns `1000` instead of an error.
**Impact**: Malformed input silently truncates. Low probability in a slider-based UI, but a risk if manual text input is added.
**Fix**: Use regex to replace all commas, or validate that there is at most one comma.

---

## Test Coverage Gaps

The existing `tests/calculator.test.js` (26 tests) covers happy paths well but has no tests for:

1. **Zero/negative/NaN inputs** to any calculator function
2. **Empty arrays** passed to `rendimentoPosFixado`, `sobrasDiscretas`
3. **Missing IR bracket** (diasCorridos beyond table range)
4. **Division by zero** in `equivalenciaIsentoCDB` and `parcelaPrice`
5. **Formatter edge cases** (no formatter tests exist at all)
6. **data-loader `isDataStale`** edge cases (no data-loader tests exist)
7. **bcb-api** is untested (requires mocking fetch/sessionStorage)

---

## Recommended Priority Actions

1. **Fix CRITICAL-01** (`calcularIR` crash) -- add fallback for missing bracket
2. **Fix CRITICAL-02** -- add property check for BCB API response fields
3. **Fix HIGH-01** (`parcelaPrice` n=0) -- guard against zero/negative n
4. **Fix HIGH-02** (`calcularIOF` negative parcelas) -- clamp to non-negative
5. **Fix MEDIUM-08** (`formatDate` crash) -- validate Date before formatting
6. **Fix MEDIUM-09** (`formatPercent` crash) -- clamp casas to non-negative
7. **Add edge-case tests** for the 7 gaps listed above
8. **Add NaN guards** in formatters to prevent "R$ NaN" in UI
