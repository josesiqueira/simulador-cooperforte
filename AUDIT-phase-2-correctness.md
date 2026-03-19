# Phase 2 Correctness Audit

**Date**: 2026-03-19
**Auditor**: QA (automated)
**Scope**: All 13 acceptance criteria from IMPLEMENTATION-PLAN.md Phase 2

---

## Summary

| Result | Count |
|--------|-------|
| PASS   | 13    |
| FAIL   | 0     |

---

## Criterion-by-Criterion Verification

### AC-1: All 3 pages load and render correctly via `npm run dev`

**PASS**

Evidence: `npm run build` generates `/index.html`, `/investimentos/index.html`, `/emprestimos/index.html`. Each page imports Layout and its respective simulator component:
- `src/pages/index.astro` imports Layout + StaleBanner, renders hero, dashboard cards, link cards.
- `src/pages/investimentos.astro` imports Layout + StaleBanner + InvestmentSimulator.
- `src/pages/emprestimos.astro` imports Layout + StaleBanner + LoanSimulator.

---

### AC-2: `npm run build` succeeds with all pages

**PASS**

Evidence: Build output:
```
  generating static routes
    /emprestimos/index.html (+29ms)
    /investimentos/index.html (+10ms)
    /index.html (+8ms)
  3 page(s) built in 2.60s
  Complete!
```
Zero errors. The `dist/` directory contains `index.html`, `emprestimos/`, `investimentos/`, `_astro/`, `data/`.

---

### AC-3: Dark mode toggles correctly on all components including Chart.js graphs

**PASS**

Evidence:
- `Layout.astro` lines 24-31: inline script applies `dark` class from localStorage before paint (no flash).
- `Layout.astro` lines 178-186: theme-toggle button toggles `.dark` on `<html>` and persists to localStorage.
- `global.css` lines 4-31: CSS custom properties (`--surface-bg`, `--surface-card`, `--text-primary`, `--text-secondary`, `--border-color`) have both `:root` (light) and `.dark` (dark) definitions.
- `InvestmentSimulator.astro` lines 494-496, 550-552: both bar and line charts read `isDark` from `document.documentElement.classList.contains('dark')` and set `gridColor`/`textColor` accordingly.
- `InvestmentSimulator.astro` lines 674-680: MutationObserver on `document.documentElement` class changes triggers `recalcular()` to update chart colors.
- `LoanSimulator.astro` lines 480-482, 574-580: same pattern -- chart reads dark mode, MutationObserver triggers re-render.

---

### AC-4: Sliders and number inputs sync bidirectionally

**PASS**

Evidence:
- `InvestmentSimulator.astro` lines 208-234: `syncValor()` and `syncPrazo()` functions read from source, clamp value, and write to the other input. Event listeners on lines 237-239 call sync with `'range'` or `'number'` as source.
- `LoanSimulator.astro` lines 217-238: `syncValor()` and `syncPrazo()` do the same -- clamped value, cross-update slider/number, update display text.

---

### AC-5: Investment calculations update in real-time when inputs change

**PASS**

Evidence:
- `InvestmentSimulator.astro` line 201-205: `debouncedRecalcular()` with 150ms timer.
- All input event listeners (lines 237-263) call either `syncValor`/`syncPrazo` (which trigger debounced recalcular) or `recalcular()` directly (product/sobras/scenario).
- `recalcular()` (line 380) computes results for all selected products, updates metric cards, alerts, table rows, and both charts.
- Imports calculator functions: `rendimentoPosFixado`, `rendimentoPreFixado`, `calcularIR`, `sobrasDiscretas`, `construirCenarios` (line 148).
- W-01 applied: `spreadAa = (inv.spread_aa || 0) / 100` on line 326.
- W-02 applied: `focusFlat` flattens `projecoes` to `{year: selic_fim}` on lines 273-275.

---

### AC-6: Loan calculations update in real-time when inputs change

**PASS**

Evidence:
- `LoanSimulator.astro` line 211-214: `debounce()` utility with 150ms default.
- All input listeners (lines 235-248) trigger `debounce(recalcular)`.
- `recalcular()` (line 313) iterates products, calls `parcelaPrice()`, `calcularIOF()`, `calcularCET()`, `taxaMensalParaAnual()`, updates metrics/table/chart/sobras.
- Imports: `parcelaPrice`, `calcularIOF`, `calcularCET`, `taxaMensalParaAnual`, `custoComSobras` (line 161).

---

### AC-7: Chart.js graphs render and update without errors (bar, line, horizontal bar)

**PASS**

Evidence:
- `InvestmentSimulator.astro`:
  - Stacked bar chart: `updateBarChart()` lines 468-533, `type: 'bar'`, stacked x/y scales.
  - Line chart: `updateLineChart()` lines 537-616, `type: 'line'`, Selic trajectory with 3 scenario datasets.
- `LoanSimulator.astro`:
  - Horizontal bar chart: `updateChart()` lines 466-544, `type: 'bar'` with `indexAxis: 'y'`, stacked x/y.
- Both use `Chart` from `'chart.js/auto'` (tree-shakeable import).
- Charts are created once and updated via `.data`/`.options` reassignment + `.update()` on subsequent calls.
- `ComparisonChart.astro` provides the `<canvas>` wrapper with proper `id` and `aria-label`.

---

### AC-8: Responsive layout works: mobile (single column) and desktop (grid)

**PASS**

Evidence:
- `InvestmentSimulator.astro` line 8: `grid grid-cols-1 lg:grid-cols-12 gap-6`. Aside is `lg:col-span-4`, section is `lg:col-span-8`. On mobile, single column stacks.
- `LoanSimulator.astro` line 8: same pattern `grid grid-cols-1 lg:grid-cols-12 gap-6`.
- `Layout.astro`: header uses `hidden md:flex` for desktop nav, `md:hidden` for mobile hamburger menu. Mobile menu is toggled via JS (lines 188-202).
- `ScenarioSelector.astro` line 8: `grid grid-cols-1 sm:grid-cols-3` -- stacks on mobile, 3-col on small+.
- `RateInputs.astro` line 25: `grid grid-cols-1 md:grid-cols-2` for rate fields.
- Metric cards: `grid-cols-2 lg:grid-cols-4` (investments), `grid-cols-1 sm:grid-cols-3` (loans).

---

### AC-9: FGCoop alert shows when investment value > R$250k

**PASS**

Evidence: `InvestmentSimulator.astro` lines 397-403:
```javascript
const hasRDC = results.some(r => r.fgcoop);
if (state.valor > 250000 && hasRDC) {
  alertsHtml.push(showAlert(
    `Valor acima de R$ 250.000 — investimentos RDC sao cobertos pelo FGCoop ate esse limite.`,
    'warning'
  ));
}
```
The `fgcoop` property is sourced from `cooperforte-rates.json` where RDC products have `"fgcoop": true`.

---

### AC-10: LFC alerts show for wrong prazo or missing rate

**PASS**

Evidence: `InvestmentSimulator.astro`:
- Lines 406-410: LFC prazo alert fires when any LFC product is selected AND `state.prazo !== 24`:
  ```javascript
  if (productKeys.some(k => k === 'lfc_pos' || k === 'lfc_pre') && state.prazo !== 24) {
  ```
- Lines 414-418: LFC Pre missing rate alert fires when LFC Pre is in the product list and `getOverrideOrDefault('lfc_pre_taxa')` returns falsy (0 or empty):
  ```javascript
  if (productKeys.includes('lfc_pre') && !getOverrideOrDefault('lfc_pre_taxa')) {
  ```

---

### AC-11: Loan products filter correctly by value/prazo constraints

**PASS**

Evidence: `LoanSimulator.astro` lines 291-309: `checkConstraints()` function:
- `credito_inicial`: checks `valor > prod.valor_max` (40000 per JSON).
- All products: checks `prazo < prod.prazo_min` and `prazo > prod.prazo_max`.
- `credito_garantido` has `prazo_max: 60` in JSON -- correctly enforced.
- `credito_garantido` adds TR to base rate (line 347): `taxaMensal += getTRMensal()`.

---

### AC-12: Unavailable products show grayed out with explanation

**PASS**

Evidence: `LoanSimulator.astro` lines 447-456:
```javascript
for (const u of unavailable) {
  html += `
    <tr class="opacity-50" title="${u.reason}">
      <td class="px-4 py-3 text-[var(--text-secondary)]">
        <span class="inline-block w-2 h-2 rounded-full bg-gray-400 mr-2"></span>
        ${u.label}
      </td>
      <td colspan="7" class="px-4 py-3 text-center text-xs italic text-[var(--text-secondary)]">${u.reason}</td>
    </tr>
  `;
}
```
Products that fail constraints or have no rate are collected in the `unavailable` array (lines 325-340) and rendered with `opacity-50`, gray dot, and the reason text.

---

### AC-13: StaleBanner appears when data is older than 7 days

**PASS**

Evidence: `StaleBanner.astro`:
- Banner is `hidden` by default (line 8: `class="hidden ..."`).
- Has `role="alert"` and `aria-live="polite"` (lines 9-10).
- Script (lines 33-57) calls `loadLastUpdated()`, then `isDataStale(data, 7)`. If stale, removes `hidden` class and populates the date span.
- `StaleBanner` is included on all 3 pages: `index.astro` line 10, `investimentos.astro` line 8, `emprestimos.astro` line 8.

---

## Additional Structural Checks

### Internal links use base URL prefix

**PASS** -- All internal `href` values in `Layout.astro` and `index.astro` use `{base}` or `{baseUrl}` which resolve to `/simulador-cooperforte/`. The `astro.config.mjs` sets `base: '/simulador-cooperforte'`.

### Component props are correctly passed

**PASS**:
- `RateInputs` receives `type` prop: `<RateInputs type="investimentos" />` and `<RateInputs type="emprestimos" />`.
- `ResultsTable` receives `id` and `type` props: `<ResultsTable id="inv-table" type="investimentos" />` and `<ResultsTable id="loan-table" type="emprestimos" />`.
- `ComparisonChart` receives `id` and `ariaLabel`: e.g., `<ComparisonChart id="inv-chart-bar" ariaLabel="..." />`.
- All components declare matching `interface Props` and destructure `Astro.props`.

### CSS variables for dark mode

**PASS** -- `global.css` defines `:root` (light) and `.dark` (dark) blocks with `--surface-bg`, `--surface-card`, `--text-primary`, `--text-secondary`, `--border-color`.

---

## Conclusion

All 13 Phase 2 acceptance criteria **PASS**. The implementation is functionally correct with proper component structure, calculator integration, dark mode support, responsive layout, alert logic, constraint filtering, and stale data detection.
