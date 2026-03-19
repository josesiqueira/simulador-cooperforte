# AUDIT -- Phase 2 Edge Cases, Error Handling & Input Validation

**Auditor**: QA Engineer
**Date**: 2026-03-19
**Scope**: All Phase 2 UI components -- edge cases, error handling, input validation
**Rating scale**: PASS / WARN (works but fragile) / FAIL (bug or missing handling)

---

## 1. InvestmentSimulator.astro

### 1.1 valor=200 (minimum)

| Check | Rating | Notes |
|-------|--------|-------|
| Slider allows 200 | PASS | `min="200"` on both range and number inputs |
| Number input clamped | PASS | `syncValor` clamps with `Math.max(200, ...)` |
| Display updates | PASS | `formatBRL(200)` produces "R$ 200,00" |
| FGCoop alert suppressed | PASS | 200 < 250000, alert skipped |

### 1.2 valor=2000000 (maximum)

| Check | Rating | Notes |
|-------|--------|-------|
| Slider allows 2000000 | PASS | `max="2000000"` on both inputs |
| Number input clamped | PASS | `Math.min(2000000, ...)` |
| FGCoop alert triggered | PASS | 2000000 > 250000, and RDC products have `fgcoop: true` |
| Computation with large value | WARN | No overflow risk at this scale, but the `rendimentoPosFixado` loop iterates per-trimestre -- fine for up to 20 trimestres. No issue. |

### 1.3 prazo=1 (minimum)

| Check | Rating | Notes |
|-------|--------|-------|
| Slider allows 1 | PASS | `min="1"` |
| Display singular "mes" | PASS | `state.prazo === 1 ? 'mes' : 'meses'` at line 228 |
| Scenario selector hidden | PASS | `prazo <= 6` hides scenario wrapper (line 231) |
| trimestres = Math.ceil(1/3) = 1 | PASS | Single trimestre calculation works |
| CDI trajectory for prazo<=6 | PASS | Uses constant CDI array, no focus interpolation |
| IR bracket at 30 dias corridos | PASS | Falls into 22.5% bracket (ate_dias: 180) |

### 1.4 prazo=60 (maximum)

| Check | Rating | Notes |
|-------|--------|-------|
| Slider allows 60 | PASS | `max="60"` |
| trimestres = Math.ceil(60/3) = 20 | PASS | 20 trimestres, 5 years |
| IR bracket at 1800 dias | PASS | Falls into 15% bracket (ate_dias: 999999) |
| Scenario selector visible | PASS | prazo > 6 |
| Focus interpolation spans 4 years of data | WARN | Focus only has 2026-2029. For trimestre q=20, the last anchor is at q=(2029-2026+1)*4=16. Trimestres 17-19 extrapolate using `hi.selic` (last value). This is correct but could produce odd results if prazo goes far beyond focus data. Acceptable for 60 months. |

### 1.5 LFC Pre selected with no rate entered

| Check | Rating | Notes |
|-------|--------|-------|
| Alert shown | PASS | Line 414: checks `getOverrideOrDefault('lfc_pre_taxa')` returns 0 (falsy), shows warning |
| Product returns null | PASS | `computeProduct` line 332: if `!taxaAa` returns null, product excluded from results |
| Metric cards show "--" if only LFC Pre selected and no rate | PASS | results.length === 0, line 431-435 |

**FAIL -- E-01**: `getOverrideOrDefault('lfc_pre_taxa')` returns `0` when input is empty (line 295-296: `return 0`). However, if a user enters `0` as a rate, this is also falsy, so a rate of 0% a.a. is treated as "no rate". This is arguably correct (0% is nonsensical for LFC Pre) but the function conflates "empty" with "zero". Minor -- no practical impact.

### 1.6 BCB API failure (fallback values)

| Check | Rating | Notes |
|-------|--------|-------|
| Selic fallback | PASS | `bcb-api.js` returns `{ data: '18/03/2026', valor: '14.900' }` for serie 432 |
| CDI fallback | PASS | Returns `{ valor: '14.890' }` for serie 4389 |
| state.selic populated from fallback | PASS | `parseFloat('14.900'.replace(',', '.'))` = 14.9. The BCB fallback uses `.` not `,` -- works correctly. |
| Fallback cached in sessionStorage | WARN | Fallback is NOT cached (the `writeCache` call is inside the try block before catch). If API keeps failing, each page load hits the API again and times out (5s). This is by design (retry on next load) but adds 5s latency each time. |

### 1.7 Data JSON files fail to load

| Check | Rating | Notes |
|-------|--------|-------|
| `loadCooperforteRates` returns null | PASS | Wrapped in try/catch, returns null |
| `loadFocusData` returns null | PASS | Same pattern |
| InvestmentSimulator handles null rates | PASS | `recalcular()` line 381: `if (!state.rates) return;` -- early exit |
| InvestmentSimulator handles null focus | PASS | `getCDITrajectory` line 268: `if (!state.focus)` falls back to constant CDI |
| index.astro handles null lastUpdated | PASS | Line 167: `if (updEl && lastUpdated && lastUpdated.timestamp)` -- guarded |

**WARN -- W-03**: When `state.rates` is null, `recalcular()` exits immediately. The UI stays showing "--" in all metric cards with no user feedback about the data load failure. There is no error banner or retry mechanism. The user sees a blank simulator with no explanation.

### 1.8 Debounce implementation

| Check | Rating | Notes |
|-------|--------|-------|
| Debounce timer | PASS | `clearTimeout(debounceTimer); debounceTimer = setTimeout(recalcular, 150);` -- standard pattern |
| Rapid slider input | PASS | Only last value triggers recalcular after 150ms |
| Product select change | WARN | Line 243: calls `recalcular()` directly (no debounce). This is fine for dropdowns (single event) but inconsistent with slider pattern. |

### 1.9 Slider and number input sync

| Check | Rating | Notes |
|-------|--------|-------|
| Range->Number sync | PASS | `syncValor('range')` copies value to number input (line 211) |
| Number->Range sync | PASS | `syncValor('number')` clamps and copies to range (line 213) |
| Display update | PASS | Both paths update `valorDisplay` |

**WARN -- W-04**: When the number input is empty (user clears it), `Number(els.valorNumber.value)` returns `NaN`, then `NaN || 200` = 200. This silently resets to 200. The slider will jump to minimum, which may confuse users. Same for prazo (resets to 1). Consider showing validation feedback.

**WARN -- W-05**: The number input does not clamp the value back into the field on blur. If a user types "5000000" (above max), `syncValor` clamps state to 2000000 and updates the slider, but the number input still shows "5000000" because `els.valorNumber.value` is set to the clamped value only when source is 'range'. Wait -- actually line 213: `els.valorRange.value = state.valor` updates the range, but `els.valorNumber.value` is NOT updated when source is 'number'. So the number input shows the out-of-range value while the state and slider use the clamped value. **This is a desync bug.**

### 1.10 W-01: spread/100 application

| Check | Rating | Notes |
|-------|--------|-------|
| Spread from JSON | The JSON has `spread_aa: 0.15` (meaning 0.15 percentage points) |
| Division by 100 | Line 326: `const spreadAa = (inv.spread_aa \|\| 0) / 100` converts 0.15 to 0.0015 |
| Used in rendimentoPosFixado | Line 327: `rendimentoPosFixado(state.valor, cdiTrajectory, spreadAa, 63)` |
| Calculator function | Line 20 in calculator.js: `fator *= Math.pow(1 + cdi + spreadAa, duPorTrimestre / 252)` |

PASS -- The spread is correctly converted from percentage points (0.15) to decimal (0.0015) before adding to CDI.

### 1.11 W-02: Focus flattening

| Check | Rating | Notes |
|-------|--------|-------|
| Focus structure | `focus.json` has `projecoes.2026.selic_fim`, etc. |
| Flattening logic | Line 273: `Object.entries(state.focus.projecoes).map(([y, v]) => [y, v.selic_fim])` |
| Result | Produces `{ "2026": 12.25, "2027": 10.50, ... }` -- correct format for `construirCenarios` |

PASS -- Flattening correctly extracts `selic_fim` per year.

**FAIL -- E-02**: The `getCDITrajectory` function (line 266-279) returns Selic trajectory values but treats them as CDI. Line 279: `return cenarios[state.cenario] || cenarios.base` -- these are Selic values from `construirCenarios`. The function name says "CDI" and the comment says "CDI tracks Selic closely" which is approximately true, but CDI is typically ~0.10 p.p. below Selic. For an educational simulator this approximation is acceptable, but it should be documented.

---

## 2. LoanSimulator.astro

### 2.1 valor=1000 (minimum)

| Check | Rating | Notes |
|-------|--------|-------|
| Slider allows 1000 | PASS | `min="1000"` |
| Clamping | PASS | `Math.max(1000, ...)` in syncValor (line 218) |
| IOF calculation | PASS | `calcularIOF(1000, 24)` = 1000 * 0.0038 + 1000 * 0.000082 * 365 = 3.80 + 29.93 = 33.73 |
| CET bisection convergence | PASS | For small PV values, bisection should converge fine within [0.0001, 0.15] |

### 2.2 valor=500000 (maximum)

| Check | Rating | Notes |
|-------|--------|-------|
| Slider allows 500000 | PASS | `max="500000"` |
| IOF large value | PASS | IOF scales linearly with PV |
| Credito Inicial constraint | PASS | `checkConstraints` line 297: valor > prod.valor_max (40000) returns unavailable |

### 2.3 ALL products filtered out

| Check | Rating | Notes |
|-------|--------|-------|
| results array empty | PASS | `updateMetrics` shows "--" for all cards |
| Table shows message | PASS | Line 459-461: "Nenhum produto disponivel" when `!html` |
| Chart destroyed | PASS | Line 471: `chartInstance.destroy()` when results empty |
| Sobras table | PASS | Line 551-553: Shows "Nenhum produto calculado" |

PASS -- Graceful degradation when no products are available.

### 2.4 Credito Trabalhador (taxa_am=null)

| Check | Rating | Notes |
|-------|--------|-------|
| Rate input field | The RateInputs component does NOT have an explicit `data-rate="credito_trabalhador"` field. |
| getProductRate returns null | PASS | Line 262-263: Falls back to `state.rates.emprestimos[key].taxa_am` which is null |
| Product skipped | PASS | Line 324: `taxaAmRaw === null \|\| isNaN(taxaAmRaw)` puts it in unavailable |
| Unavailable message | PASS | Shows "Taxa nao definida -- preencha em Ajustar taxas" |

**FAIL -- E-03**: There is no rate input field for `credito_trabalhador` in `RateInputs.astro`. The unavailable message says "preencha em Ajustar taxas" but there IS no field to fill in. The user has no way to provide a rate for this product. This is a UI dead-end. Either add an input field for credito_trabalhador or change the message.

### 2.5 Credito Garantido + TR

| Check | Rating | Notes |
|-------|--------|-------|
| TR added to rate | PASS | Line 347-348: `if (key === 'credito_garantido') taxaMensal += getTRMensal()` |
| getTRMensal conversion | PASS | Reads TR input value, divides by 100 to convert % to decimal |
| TR from BCB API | PASS | Fallback gives `0.090` (0.090% monthly) -- getTRMensal returns 0.00090 |

PASS -- TR is correctly added to the Credito Garantido base rate.

### 2.6 IOF calculation formula

| Check | Rating | Notes |
|-------|--------|-------|
| Formula in calculator.js | `pv * 0.0038 + pv * 0.000082 * min(parcelas*30, 365)` |
| Spec reference | 0.38% fixed + 0.0082%/day capped at 365 days |
| Conversion check | 0.0082% = 0.000082 -- PASS |
| Cap at 365 days | `Math.min(parcelas * 30, 365)` -- for 13+ parcelas, capped at 365 |

**WARN -- W-06**: The IOF calculation treats the entire loan balance as if it has a single repayment date. In reality, IOF is calculated per-parcela: each installment repays a fraction of principal, and the daily IOF should be calculated on the principal portion of each installment based on its specific number of days outstanding. The current formula is a simplification that overestimates IOF for longer-term loans. This is acceptable for an educational tool but should be documented. The spec itself uses this simplified formula, so this matches spec.

### 2.7 CET bisection convergence for extreme values

| Check | Rating | Notes |
|-------|--------|-------|
| Search range | `lo=0.0001, hi=0.15` (0.01% to 15% monthly) |
| Extreme case: 0.01% a.m., 96 parcelas | CET will be near 0.01% monthly -- within bounds |
| Extreme case: 10% a.m., 4 parcelas | CET could be ~10%+ monthly, exceeds hi=0.15 |

**FAIL -- E-04**: If the effective monthly rate exceeds 15% (hi bound), bisection will converge to ~0.15 instead of the true value. This can happen with very high rates + IOF + short terms. For example, MultiCredito at 2.19% a.m. with IOF on a 4-parcela loan: effective rate could push toward the ceiling. In practice, 15% monthly is extreme (435% annual), but the bisection should detect non-convergence. The upper bound should be higher or the function should return a flag indicating convergence failure.

### 2.8 Loan sync bug

**WARN -- W-07**: Same as investment simulator (W-05). In `syncValor` (line 218): `const val = Math.max(1000, Math.min(500000, Number(source.value) || 1000))`. If the user types a value > 500000 in the number input, state is clamped but the input field is NOT corrected: line 220 `if (source !== valorInput) valorInput.value = val` -- this condition is FALSE when the source IS the input, so the input keeps showing the unclamped value. **Desync bug.**

### 2.9 Promise.all vs Promise.allSettled

**WARN -- W-08**: LoanSimulator uses `Promise.all` (line 587) while InvestmentSimulator uses `Promise.allSettled` (line 623). If `fetchTR()` throws (rather than catching internally), `Promise.all` will reject entirely and `state.rates` will never be set, breaking the whole simulator. In practice, `fetchBCBSerie` catches all errors internally so this is unlikely to trigger, but the inconsistency is a code smell and a latent risk if bcb-api.js is ever refactored.

---

## 3. index.astro

### 3.1 BCB API unreachable

| Check | Rating | Notes |
|-------|--------|-------|
| All 3 fetches use Promise.all | Line 137-142 |
| Fallback values used | PASS | bcb-api.js returns hardcoded fallbacks on failure |
| Dashboard shows fallback data | PASS | parseFloat('14.900'.replace(',', '.')) = 14.9 |
| No error indication | WARN | User sees stale fallback values with no indication they are not live |

**WARN -- W-09**: When BCB API is unreachable, the dashboard shows hardcoded fallback values (Selic 14.9%, CDI 14.89%, TR 0.09%) without any visual indicator that these are fallback/cached values. The "Atualizado em" card shows the last-updated.json date, not the BCB fetch date, so this partially mitigates confusion.

### 3.2 loadLastUpdated failure

| Check | Rating | Notes |
|-------|--------|-------|
| Returns null | PASS | data-loader.js catches and returns null |
| Dashboard handles null | PASS | Line 167: null guard `if (updEl && lastUpdated && lastUpdated.timestamp)` |
| Display stays "--/--/----" | PASS | Default text preserved |

---

## 4. Atomic Components

### 4.1 StaleBanner: last-updated.json missing

| Check | Rating | Notes |
|-------|--------|-------|
| loadLastUpdated returns null | PASS | Returns null on 404 |
| checkStale handles null | PASS | Line 43: `if (!data) return;` |
| isDataStale with null | PASS | Line 65: `if (!lastUpdated) return true` -- but this path is never reached because of the null check above |
| Banner stays hidden | PASS | No errors thrown, banner remains hidden |

**WARN -- W-10**: When last-updated.json is missing (returns null), the StaleBanner stays hidden. This means if the data file is deleted or corrupted, users get NO staleness warning at all. Since `isDataStale(null)` returns `true`, one might expect the banner to show. But the `if (!data) return;` guard at line 43 prevents it. This is arguably wrong: missing metadata should be treated as stale.

### 4.2 RateInputs: lock toggle

| Check | Rating | Notes |
|-------|--------|-------|
| Initial state | All fields start with `data-locked="true"` except LFC Pre which is `data-locked="false"` |
| Lock -> Unlock | PASS | Toggles `data-locked` attribute, removes `disabled`, swaps icons |
| Unlock -> Lock | PASS | Sets `disabled`, swaps icons back |
| Locked fields editable? | **FAIL -- E-05** |

**FAIL -- E-05**: Rate input fields start with `data-locked="true"` in the HTML, but the inputs do NOT have the `disabled` attribute in the HTML markup. The `disabled` attribute is only set by the JavaScript toggle. This means on initial page load, ALL rate inputs are visually "locked" (lock icon visible) but are actually editable. The JavaScript lock/unlock only applies `disabled` when the user clicks the button. On first render, the fields are writable despite showing a lock icon. The init function in InvestmentSimulator populates values into these fields (lines 654-659), which works because they are not disabled. But the user can edit them freely before clicking the lock button, creating confusion about what "locked" means.

**Recommendation**: Either add `disabled` attribute to the HTML inputs that start locked, or remove the lock concept entirely and rely on the populated defaults.

### 4.3 ScenarioSelector: default checked

| Check | Rating | Notes |
|-------|--------|-------|
| "Base Focus" has `checked` attribute | PASS | Line 35: `checked` on the base radio |
| InvestmentSimulator state matches | PASS | `state.cenario = 'base'` (line 159) |
| CSS `:checked` styling | PASS | `has-[:checked]` classes applied |

PASS -- Default is correctly set and synchronized.

### 4.4 RateInputs: Credito Trabalhador field missing

See E-03 above. The emprestimos rate inputs include fields for all products except `credito_trabalhador`. This product has `taxa_am: null` in the JSON and requires manual entry, but there is no input field for it.

---

## 5. Cross-Cutting Issues

### 5.1 XSS in innerHTML

**WARN -- W-11**: Multiple components use `innerHTML` with template literals to render table rows and alerts:
- `InvestmentSimulator.astro` line 421: `els.alerts.innerHTML = alertsHtml.join('')`
- `InvestmentSimulator.astro` line 445-459: table rows with `r.label`
- `LoanSimulator.astro` line 463: `tbody.innerHTML = html` with `r.label` and `u.reason`

Product labels (`r.label`) come from hardcoded constants (PRODUCTS / PRODUCT_LABELS), not user input, so XSS risk is minimal. However, `u.reason` includes constraint messages that reference `formatBRL(prod.valor_max)` which comes from JSON data. If the JSON is compromised (e.g., by a malicious scraping update), this could be an injection vector. Low risk given the static data source but worth noting.

### 5.2 No loading state

**WARN -- W-12**: Neither simulator shows a loading indicator during initialization. The `init()` function is async and fetches BCB API data + JSON files. During this time (potentially 5+ seconds if API times out), the user sees "--" values with no spinner or "Loading..." text.

### 5.3 Chart.js canvas reuse

**WARN -- W-13**: In LoanSimulator, `updateChart` uses `chartInstance.data = data; chartInstance.options = options; chartInstance.update()` to update the chart. Reassigning the entire `options` object can cause Chart.js to lose internal state (animation callbacks, etc.). The InvestmentSimulator uses a safer approach of updating individual option paths. This could cause visual glitches in the loan chart on rapid updates.

---

## Summary of Findings

### FAIL (bugs requiring fix)

| ID | Component | Issue |
|----|-----------|-------|
| E-01 | InvestmentSimulator | `getOverrideOrDefault` returns 0 for empty inputs, conflating "no value" with "zero" |
| E-02 | InvestmentSimulator | CDI trajectory uses Selic values without CDI-specific offset (documented approximation) |
| E-03 | LoanSimulator + RateInputs | No rate input field for `credito_trabalhador` -- message says "preencha em Ajustar taxas" but no field exists |
| E-04 | calculator.js | CET bisection upper bound of 15% monthly may not cover extreme scenarios |
| E-05 | RateInputs | Inputs start without `disabled` attribute despite showing lock icon -- user can edit "locked" fields |

### WARN (fragile / UX issues)

| ID | Component | Issue |
|----|-----------|-------|
| W-03 | InvestmentSimulator | No error feedback when cooperforte-rates.json fails to load |
| W-04 | Both simulators | Empty number input silently resets to min value |
| W-05 | InvestmentSimulator | Number input shows unclamped value when out of range (desync) |
| W-06 | calculator.js | IOF formula is simplified (per-loan not per-installment) -- matches spec |
| W-07 | LoanSimulator | Same number input desync as W-05 |
| W-08 | LoanSimulator | Uses Promise.all instead of Promise.allSettled (latent risk) |
| W-09 | index.astro | BCB fallback values shown without any "stale" indicator |
| W-10 | StaleBanner | Missing last-updated.json causes banner to stay hidden instead of showing warning |
| W-11 | Both simulators | innerHTML with template literals (low XSS risk) |
| W-12 | Both simulators | No loading state during async initialization |
| W-13 | LoanSimulator | Chart.js options object fully replaced on update |

### PASS (verified working)

- Slider/number sync (both simulators)
- Debounce implementation (150ms)
- FGCoop alert at >250k
- LFC prazo warning
- LFC Pre empty rate warning
- Scenario selector default checked (base)
- Focus flattening (W-02 from plan)
- Spread/100 conversion (W-01 from plan)
- BCB API fallback chain (cache -> fetch -> hardcoded)
- Dark mode chart re-rendering via MutationObserver
- Credito Garantido TR addition
- Product constraint filtering (Credito Inicial max, prazo limits)
- Credito Trabalhador graceful degradation (null rate)
- All products filtered out (empty state)
- StaleBanner with valid data
- ResultsTable column counts match header
- ComparisonChart canvas wrapper with aria-label
