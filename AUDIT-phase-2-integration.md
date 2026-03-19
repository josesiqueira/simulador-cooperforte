# Audit: Phase 2 -- Integration & Quality

Auditor: Claude (QA)
Date: 2026-03-19
Scope: Phase 2 (UI -- Pages & Components) integration with Phase 1, build verification, code quality, spec compliance.

---

## 1. Build Verification

### `npm run build` -- PASS

- Build completes in ~2.7s with zero errors.
- One harmless Vite warning about unused imports from `@astrojs/internal-helpers/remote` in Astro internals (not our code).
- All 3 pages generated: `dist/index.html`, `dist/investimentos/index.html`, `dist/emprestimos/index.html`.

### dist/ contents -- PASS

- 3 HTML pages present.
- Assets bundled under `dist/_astro/`: Chart.js (`auto.Dl3QVlgZ.js`), bcb-api, formatters, InvestmentSimulator script, LoanSimulator script, StaleBanner script, index page script, CSS bundle.
- JSON data files copied: `dist/data/cooperforte-rates.json`, `dist/data/focus.json`, `dist/data/last-updated.json`.

### `npm test` -- PASS

- All 26 Phase 1 tests pass. No regressions.

---

## 2. Integration with Phase 1 Libraries

### 2.1 InvestmentSimulator imports vs calculator.js exports

| Imported in InvestmentSimulator | Exported by calculator.js | Match? |
|---|---|---|
| `rendimentoPosFixado` | Yes | OK |
| `rendimentoPreFixado` | Yes | OK |
| `calcularIR` | Yes | OK |
| `sobrasDiscretas` | Yes | OK |
| `construirCenarios` | Yes | OK |

**Finding (MINOR)**: `equivalenciaIsentoCDB` and `construirTrajetoria` are exported by calculator.js but not used anywhere in the UI. This is dead code from the library's perspective but acceptable -- they are utility functions available for future use.

### 2.2 LoanSimulator imports vs calculator.js exports

| Imported in LoanSimulator | Exported by calculator.js | Match? |
|---|---|---|
| `parcelaPrice` | Yes | OK |
| `calcularIOF` | Yes | OK |
| `calcularCET` | Yes | OK |
| `taxaMensalParaAnual` | Yes | OK |
| `custoComSobras` | Yes | OK |

All signatures and return shapes used correctly.

### 2.3 Formatters usage

| Function | Used in | Match? |
|---|---|---|
| `formatBRL` | InvestmentSimulator, LoanSimulator | OK |
| `formatPercent` | InvestmentSimulator, LoanSimulator, index.astro | OK |
| `formatNumber` | InvestmentSimulator (line chart y-axis) | OK |
| `formatDate` | index.astro, StaleBanner.astro | OK |
| `parseBRLInput` | Not used anywhere in UI | Unused (MINOR) |

**Finding (MINOR)**: `parseBRLInput` is exported by formatters.js but never imported by any Phase 2 component. Not a bug, but dead code from the UI perspective.

### 2.4 bcb-api.js usage

| Function | Used in | Match? |
|---|---|---|
| `fetchSelic` | InvestmentSimulator, index.astro | OK |
| `fetchCDI` | InvestmentSimulator, index.astro | OK |
| `fetchTR` | LoanSimulator, index.astro | OK |

All return shapes handled correctly (`.valor` parsed with `.replace(',', '.')`).

### 2.5 data-loader.js usage

| Function | Used in | Match? |
|---|---|---|
| `loadCooperforteRates` | InvestmentSimulator, LoanSimulator | OK |
| `loadFocusData` | InvestmentSimulator | OK |
| `loadLastUpdated` | index.astro, StaleBanner | OK |
| `isDataStale` | StaleBanner | OK |

All called with correct `baseUrl` pattern (`import.meta.env.BASE_URL.replace(/\/$/, '')`).

### 2.6 JSON structure access vs actual cooperforte-rates.json

**InvestmentSimulator accesses**:
- `state.rates.investimentos[key]` -- matches JSON keys (`rdc_i`, `rdc_q`, `rdc_sq`, `lfc_pos`, `lfc_pre`). OK.
- `inv.spread_aa` -- present on `rdc_q` (0.15), `rdc_sq` (0.35), `lfc_pos` (0.40). `rdc_i` has no `spread_aa`, handled via `|| 0`. OK.
- `inv.fgcoop` -- present on all investment products. OK.
- `state.rates.ir_regressivo` -- matches `ir_regressivo` array. OK.
- `state.rates.sobras.investimentos_cdi_pct` -- matches JSON (116.1). OK.

**LoanSimulator accesses**:
- `state.rates.emprestimos[key]` -- matches all 7 loan product keys. OK.
- `prod.taxa_am` -- present on all except `credito_trabalhador` (null). OK.
- `prod.valor_max` -- only on `credito_inicial` (40000). OK.
- `prod.prazo_min`, `prod.prazo_max` -- present on all products. OK.
- `rates.sobras.emprestimos_devolucao_pp_aa` -- matches JSON (1.50). OK.

---

## 3. Code Quality

### 3.1 Dead code / unused imports

| Item | Severity | Notes |
|---|---|---|
| `equivalenciaIsentoCDB` in calculator.js | MINOR | Exported but never imported by UI. Useful utility, acceptable. |
| `parseBRLInput` in formatters.js | MINOR | Exported but never imported by UI. Could be useful for future BRL input parsing. |
| `construirTrajetoria` in calculator.js | N/A | Used internally by `construirCenarios`. Not dead code. |

### 3.2 Naming conventions

- **JS**: camelCase used consistently for variables, functions, state properties. OK.
- **CSS**: kebab-case for CSS custom properties (`--surface-bg`, `--text-primary`, `--border-color`). OK.
- **Component files**: PascalCase for Astro components. OK.
- **HTML IDs**: kebab-case (`inv-valor-range`, `loan-metric-parcela`). OK.

### 3.3 Chart.js import

- Both InvestmentSimulator and LoanSimulator use `import Chart from 'chart.js/auto'`. This is the correct auto-registration import. OK.

### 3.4 Potential memory leaks -- Chart instances

**InvestmentSimulator**:
- `barChart` and `lineChart` are module-level variables.
- Charts are updated in-place via `.update()` when they already exist, and only created once. OK pattern.
- **ISSUE (MEDIUM)**: Charts are never destroyed on page teardown. Since Astro generates static pages and navigations cause full page loads, this is not a practical leak. However, `barChart` and `lineChart` are never `.destroy()`-ed. If the component were ever used in an SPA context, this would leak.
- The `darkObserver` (MutationObserver) is never disconnected. Same reasoning applies -- acceptable for static pages but technically a leak.

**LoanSimulator**:
- `chartInstance` is destroyed when results are empty (line 471: `chartInstance.destroy()`). Good.
- Updated in-place otherwise. OK.
- `darkObserver` also never disconnected. Same note as above.

**Verdict**: Acceptable for the static SSG architecture. Would need cleanup hooks for SPA use.

### 3.5 getElementById calls vs actual HTML element IDs

**InvestmentSimulator** -- all verified:

| JS getElementById | Present in HTML | Match? |
|---|---|---|
| `inv-valor-range` | InvestmentSimulator.astro line 22 | OK |
| `inv-valor-number` | InvestmentSimulator.astro line 29 | OK |
| `inv-valor-display` | InvestmentSimulator.astro line 17 | OK |
| `inv-prazo-range` | InvestmentSimulator.astro line 47 | OK |
| `inv-prazo-number` | InvestmentSimulator.astro line 54 | OK |
| `inv-prazo-display` | InvestmentSimulator.astro line 42 | OK |
| `inv-produto` | InvestmentSimulator.astro line 68 | OK |
| `inv-sobras` | InvestmentSimulator.astro line 88 | OK |
| `inv-metric-bruto` | InvestmentSimulator.astro line 105 | OK |
| `inv-metric-ir` | InvestmentSimulator.astro line 109 | OK |
| `inv-metric-liquido` | InvestmentSimulator.astro line 113 | OK |
| `inv-metric-total` | InvestmentSimulator.astro line 117 | OK |
| `inv-alerts` | InvestmentSimulator.astro line 122 | OK |
| `inv-table-body` | Generated by ResultsTable via `id="${id}-body"` with id="inv-table" | OK |
| `inv-data-date` | InvestmentSimulator.astro line 141 | OK |
| `inv-scenario-wrapper` | InvestmentSimulator.astro line 81 | OK |
| `inv-chart-bar` | ComparisonChart via id prop | OK |
| `inv-chart-line` | ComparisonChart via id prop | OK |
| `rate-selic` | RateInputs.astro line 30 | OK |
| `rate-cdi` | RateInputs.astro line 49 | OK |
| `rate-spread-rdc-q` | RateInputs.astro line 68 | OK |
| `rate-spread-rdc-sq` | RateInputs.astro line 88 | OK |
| `rate-spread-lfc-pos` | RateInputs.astro line 106 | OK |
| `rate-sobras-cdi` | RateInputs.astro line 125 | OK |
| `rate-lfc-pre` | RateInputs.astro line 144 | OK |

**LoanSimulator** -- all verified:

| JS getElementById / querySelector | Present in HTML | Match? |
|---|---|---|
| `loan-valor-slider` | LoanSimulator.astro line 20 | OK |
| `loan-valor-input` | LoanSimulator.astro line 29 | OK |
| `loan-valor-display` | LoanSimulator.astro line 18 | OK |
| `loan-prazo-slider` | LoanSimulator.astro line 45 | OK |
| `loan-prazo-input` | LoanSimulator.astro line 50 | OK |
| `loan-prazo-display` | LoanSimulator.astro line 41 | OK |
| `loan-produto` | LoanSimulator.astro line 65 | OK |
| `loan-metric-parcela` | LoanSimulator.astro line 90 | OK |
| `loan-metric-parcela-produto` | LoanSimulator.astro line 91 | OK |
| `loan-metric-total` | LoanSimulator.astro line 95 | OK |
| `loan-metric-total-produto` | LoanSimulator.astro line 96 | OK |
| `loan-metric-cet` | LoanSimulator.astro line 100 | OK |
| `loan-metric-cet-produto` | LoanSimulator.astro line 101 | OK |
| `loan-table-body` | Generated by ResultsTable via id="loan-table" -> "loan-table-body" | OK |
| `loan-chart-bar` | ComparisonChart via id prop | OK |
| `loan-sobras-body` | LoanSimulator.astro line 135 | OK |
| `rate-inputs-emprestimos` | RateInputs via id prop | OK |
| `[data-rate="..."]` selectors | RateInputs has data-rate attrs on all emprestimos inputs | OK |

**Landing page (index.astro)**:

| JS getElementById | Present in HTML | Match? |
|---|---|---|
| `dash-selic` | index.astro line 37 | OK |
| `dash-cdi` | index.astro line 45 | OK |
| `dash-tr` | index.astro line 53 | OK |
| `dash-updated` | index.astro line 61 | OK |

**Layout.astro**:

| JS getElementById | Present in HTML | Match? |
|---|---|---|
| `theme-toggle` | Layout.astro line 71 | OK |
| `mobile-menu-btn` | Layout.astro line 96 | OK |
| `mobile-menu` | Layout.astro line 118 | OK |
| `hamburger-icon` | Layout.astro line 103 | OK |
| `close-icon` | Layout.astro line 108 | OK |

**StaleBanner.astro**:

| JS getElementById | Present in HTML | Match? |
|---|---|---|
| `stale-banner` | StaleBanner.astro line 7 | OK |
| `stale-date` | StaleBanner.astro line 20 | OK |

All getElementById calls match actual element IDs. No mismatches found.

---

## 4. Spec Compliance

### 4.1 Investment Simulator -- Inputs

| Spec requirement | Implemented? | Notes |
|---|---|---|
| Valor slider+number R$200--R$2M | YES | min=200, max=2000000 |
| Prazo slider 1--60m | YES | min=1, max=60 |
| Produto dropdown with all 5 + "Comparar todos" | YES | All 6 options present |
| Cenario Selic 3 radios | YES | Acelerado/Base/Gradual |
| Sobras toggle (default off) | YES | Checkbox, unchecked by default |
| Collapsible rate inputs | YES | `<details>` with all editable fields |
| LFC Pre field mandatory, no default | YES | Placeholder "Preencher manualmente", starts empty |
| Selic/CDI auto-filled from BCB | YES | Populated in init() |
| Prazo <= 6m hides scenarios | YES | scenarioWrapper hidden |
| Sliders sync bidirectionally | YES | Both directions implemented |

### 4.2 Investment Simulator -- Outputs

| Spec requirement | Implemented? | Notes |
|---|---|---|
| 4 metric cards (bruto, IR, liquido, total) | YES | All 4 present |
| Comparative table (all products) | YES | Sorted by total descending, best highlighted |
| Stacked bar chart (principal + rendimento + sobras) | YES | 3 datasets when sobras on |
| Selic trajectory line chart (3 scenarios) | YES | 3 lines with correct colors |
| Footer with data date, source, disclaimer | YES | Present |
| FGCoop alert >R$250k | YES | Line 398 checks value > 250000 |
| LFC prazo alert (prazo != 24) | YES | Line 406 |
| LFC Pre empty rate alert | YES | Line 414 |

### 4.3 Loan Simulator -- Inputs

| Spec requirement | Implemented? | Notes |
|---|---|---|
| Valor slider+number R$1k--R$500k | YES | min=1000, max=500000 |
| Prazo slider 4--96 | YES | min=4, max=96 |
| Produto dropdown with all 7 + "Comparar todos" | YES | All 8 options present |
| Collapsible rate inputs | YES | Includes all products + TR + IOF + Sobras |
| TR auto-filled from BCB | YES | Populated in init() |
| IOF fixo and diario editable | YES | Fields present with defaults 0.38 and 0.0082 |
| Devolucao sobras editable (default 1.50) | YES | Field present |

### 4.4 Loan Simulator -- Outputs

| Spec requirement | Implemented? | Notes |
|---|---|---|
| 3 metric cards (best parcela, menor total, menor CET) | YES | All 3 present |
| Ranking table (by total ascending) | YES | Sorted ascending with 8 columns |
| Horizontal bar chart (stacked: principal+IOF+juros) | YES | indexAxis='y' |
| "Com sobras" section | YES | Dedicated table with nominal/efetiva rates |
| Unavailable products grayed out | YES | opacity-50 with reason text |
| IOF disclaimer | YES | Mentions Decreto 12.499/2025 |
| General disclaimer | YES | "nao constitui recomendacao financeira" |

### 4.5 Loan Simulator -- Logic

| Spec requirement | Implemented? | Notes |
|---|---|---|
| Parcela = Price over (PV + IOF) | YES | `parcelaPrice(valor + iof, taxaMensal, prazo)` |
| IOF formula correct | YES | Uses `calcularIOF(valor, prazo)` |
| CET by bisection | YES | `calcularCET(valor, parcela, prazo)` |
| Credito Inicial max R$40k filter | YES | `checkConstraints` at line 297 |
| Credito Garantido adds TR | YES | `taxaMensal += getTRMensal()` at line 347 |
| Products with null taxa grayed out | YES | credito_trabalhador handled |

### 4.6 Landing Page

| Spec requirement | Implemented? | Notes |
|---|---|---|
| Selic live card | YES | Fetched from BCB |
| CDI live card | YES | Fetched from BCB |
| TR live card | YES | Fetched from BCB (spec only says Selic+CDI, but TR is a bonus) |
| Last updated card | YES | From last-updated.json |
| Link to investment simulator | YES | Correct URL |
| Link to loan simulator | YES | Correct URL |
| StaleBanner | YES | Present on all 3 pages |

### 4.7 Layout & General

| Spec requirement | Implemented? | Notes |
|---|---|---|
| Header with nav (Inicio, Investimentos, Emprestimos) | YES | Desktop + mobile nav |
| Dark mode toggle with localStorage | YES | Correct implementation |
| Skip-to-content link | YES | `<a href="#main">` |
| Footer disclaimer | YES | "nao constitui recomendacao financeira" |
| Mobile-first responsive | YES | grid-cols-1 -> lg:grid-cols-12 |
| lang="pt-BR" | YES | On `<html>` tag |
| Cooperforte green (#00A651) | YES | CSS vars + Tailwind config |
| Inter font | YES | Google Fonts loaded in Layout.astro |

### 4.8 Product names vs spec

| Spec name | UI label | Match? |
|---|---|---|
| RDC-i | RDC-i | OK |
| RDC-q | RDC-q | OK |
| RDC-sq | RDC-sq | OK |
| LFC Pre | LFC Pre | OK (spec uses accent: "Pre" -- UI matches) |
| LFC Pos | LFC Pos | OK |
| Consignado (Direto) | Consignado Direto | OK |
| Consignado (Portabilidade) | Consig. Portabilidade | OK (abbreviated in table label) |
| Credito Inicial | Credito Inicial | OK |
| MultiCredito | MultiCredito | OK |
| Credito Garantido | Credito Garantido | OK |
| CredCooper40 | CredCooper40 | OK |
| Credito do Trabalhador | Credito do Trabalhador (dropdown) / Cred. Trabalhador (table) | OK |

---

## 5. Issues Found

### MEDIUM Severity

**M-1: InvestmentSimulator ignores user overrides for spread rates**
- File: `/home/jose/Documents/Cooperforte-renda-fixa/src/components/InvestmentSimulator.astro`, line 326
- The `computeProduct()` function reads `inv.spread_aa` directly from the loaded JSON data, bypassing the user-editable rate inputs (`rate-spread-rdc-q`, `rate-spread-rdc-sq`, `rate-spread-lfc-pos`).
- Although `getOverrideOrDefault()` has mappings for `spread_rdc_q`, `spread_rdc_sq`, and `spread_lfc_pos`, these are never called during the product computation for pos-fixado products.
- **Impact**: Users can edit the spread fields in the "Ajustar taxas" panel, but changing them has no effect on calculations.
- **Fix**: Replace `(inv.spread_aa || 0)` with a lookup that first checks the rate input override, falling back to `inv.spread_aa`.

**M-2: IOF rate overrides in RateInputs are not consumed by LoanSimulator**
- File: `/home/jose/Documents/Cooperforte-renda-fixa/src/components/LoanSimulator.astro`
- The RateInputs component for emprestimos includes editable fields for `iof_fixo` (0.38%) and `iof_diario` (0.0082%), but the LoanSimulator script calls `calcularIOF(valor, prazo)` which uses hardcoded constants (0.0038 and 0.000082) from calculator.js.
- The rate input values for `iof_fixo` and `iof_diario` are never read by any code.
- **Impact**: Users can edit IOF rates but the changes have no effect.
- **Fix**: Either read the IOF overrides and pass them to the calculator, or modify `calcularIOF` to accept optional rate parameters, or remove the editable IOF fields.

**M-3: No min_aplicacao validation in InvestmentSimulator**
- File: `/home/jose/Documents/Cooperforte-renda-fixa/src/components/InvestmentSimulator.astro`
- The spec defines minimum investment amounts per product (e.g., RDC-q: R$100k, RDC-sq: R$1M, LFC: R$100k), and the JSON includes `min_aplicacao` fields. However, `computeProduct()` never checks whether `state.valor` meets `inv.min_aplicacao`.
- **Impact**: Products are simulated even when the investment amount is below their minimum. Users see results for products they cannot actually access.
- **Fix**: Add a check similar to LoanSimulator's `checkConstraints()` that validates `state.valor >= inv.min_aplicacao` and shows unavailable products grayed out with an explanation.

**M-4: InvestmentSimulator Chart instances never destroyed**
- File: `/home/jose/Documents/Cooperforte-renda-fixa/src/components/InvestmentSimulator.astro`
- `barChart` and `lineChart` are created but never destroyed. Unlike LoanSimulator which destroys its chart when results are empty (line 471), InvestmentSimulator has no destroy path.
- **Impact**: Minor for static pages. Would be a memory leak in SPA navigation.
- **Fix**: Add `barChart.destroy()` / `lineChart.destroy()` when results are empty, mirroring LoanSimulator's pattern.

### LOW Severity

**L-1: Credito Garantido prazo_max constraint not explicitly checked**
- File: `/home/jose/Documents/Cooperforte-renda-fixa/src/components/LoanSimulator.astro`
- The spec says "Garantido max 60 parcelas". The JSON has `prazo_max: 60`. The `checkConstraints()` function does check `prod.prazo_max` generically at line 304-306, so this IS handled. No issue.
- (Self-corrected during audit -- initially flagged, verified as OK.)

**L-2: `getOverrideOrDefault()` returns 0 as fallback instead of null**
- File: `/home/jose/Documents/Cooperforte-renda-fixa/src/components/InvestmentSimulator.astro`, line 295
- When a rate input is empty, the function returns `0`. For Selic and CDI, this means uninitialized/unfetched rates default to 0% rather than showing an error or waiting.
- **Impact**: If BCB API fails and fallback also fails, calculations proceed with 0% Selic/CDI, producing misleading results. In practice, bcb-api.js has hardcoded fallbacks that prevent this scenario.
- **Recommendation**: Consider returning `null` and handling it in callers.

**L-3: `darkObserver` MutationObserver never disconnected**
- Files: InvestmentSimulator.astro (line 674), LoanSimulator.astro (line 575)
- Both simulators create a MutationObserver on `document.documentElement` that is never cleaned up.
- **Impact**: None for static pages. Would need cleanup for SPA use.

**L-4: Credito Trabalhador included in dropdown but has no editable rate field in RateInputs**
- Files: LoanSimulator.astro, RateInputs.astro
- The dropdown includes "Credito do Trabalhador" but there is no corresponding rate input field in the emprestimos RateInputs. Since `taxa_am` is null in JSON, the product always shows as unavailable ("Taxa nao definida") with no way for the user to provide a rate.
- **Impact**: Minor UX gap. Users who know the rate cannot simulate this product.
- **Fix**: Add a rate input field for `credito_trabalhador` in the emprestimos section of RateInputs, similar to how LFC Pre is handled in investimentos.

**L-5: `parseBRLInput` exported but unused**
- File: `/home/jose/Documents/Cooperforte-renda-fixa/src/lib/formatters.js`, line 75
- Exported function never imported by any component. Not causing issues.

---

## 6. Summary

| Category | Status |
|---|---|
| Build (`npm run build`) | PASS -- clean, 3 pages, all assets |
| Tests (`npm test`) | PASS -- 26/26, no regressions |
| Phase 1 import/export matching | PASS -- all imports resolve correctly |
| JSON structure access | PASS -- all field accesses match actual JSON |
| getElementById vs HTML IDs | PASS -- all 40+ IDs verified, zero mismatches |
| Chart.js import | PASS -- `chart.js/auto` used correctly |
| Naming conventions | PASS -- consistent camelCase/kebab-case |
| Spec compliance (inputs) | PASS -- all required inputs present |
| Spec compliance (outputs) | PASS -- all required outputs present |
| Spec compliance (logic) | PASS with caveats -- core logic correct, but overrides not fully wired (M-1, M-2) |
| Spec compliance (disclaimers) | PASS -- present on all pages |
| Spec compliance (product names) | PASS |

**Total issues: 4 MEDIUM, 5 LOW, 0 CRITICAL.**

The 4 medium issues are all related to user-editable rate overrides not being consumed by the calculation logic (spreads, IOF) and a missing `min_aplicacao` validation. The core financial calculations, data loading, API integration, and UI rendering are all correct and well-integrated with Phase 1.
