# Audit Report -- Phase 1: Integration, Build & Code Quality

**Auditor**: QA Engineer (automated)
**Date**: 2026-03-19
**Scope**: Phase 1 of IMPLEMENTATION-PLAN.md -- Core Engine & Data Layer

---

## 1. Build Verification

### 1.1 `npm run build` -- PASS

- Build completes in ~1.5s, output mode `static`.
- One Vite warning (external imports `matchHostname`, `matchPathname`, `matchPort`, `matchProtocol` from `@astrojs/internal-helpers/remote` never used in `node_modules/astro/dist/assets/utils/index.js`). This is an upstream Astro framework warning, not project code. **No action required.**

### 1.2 dist/ output -- PASS

Files produced:

```
dist/index.html
dist/_astro/index@_@astro.DnWjZXQY.css
dist/data/cooperforte-rates.json
dist/data/focus.json
dist/data/last-updated.json
dist/favicon.ico
dist/favicon.svg
```

- `index.html` exists and contains correct markup.
- All three `public/data/*.json` files are copied to `dist/data/`.
- CSS asset is generated and linked.

### 1.3 `npm test` -- PASS

- 1 test file, **26 tests passed**, 0 failures.
- Duration: 353ms.

---

## 2. Code Quality

### 2.1 src/lib/calculator.js -- 13 functions, PASS with findings

**Exported functions (13 total, spec calls for 11)**:
`rendimentoPosFixado`, `rendimentoPreFixado`, `calcularIR`, `sobrasDiscretas`, `equivalenciaIsentoCDB`, `construirTrajetoria`, `construirCenarios`, `parcelaPrice`, `calcularIOF`, `calcularCET`, `taxaMensalParaAnual`, `custoComSobras`.

That is **12 named exports**. The spec lists 12 unique function names (the plan header says "11" but then lists 12 in the task description when you count `custoComSobras`). All 12 are present. No function is missing.

**Pure functions check**: PASS. No global state mutations, no DOM access, no I/O, no `Date.now()`, no `Math.random()`. All functions are deterministic given their inputs.

**Dead code**: None detected.

**Unused imports**: None -- the file has zero imports.

**Potential robustness issue (LOW)**:
- `calcularIR` (line 44): `tabela.find()` can return `undefined` if `diasCorridos` exceeds all `ate_dias` values, which would cause a crash on `.aliquota` access. In practice, the JSON table uses `999999` as the final bracket, so this is safe for expected inputs. However, adding a guard clause would make it more defensive.

### 2.2 src/lib/data-loader.js -- PASS

- 4 exports: 3 async functions (`loadCooperforteRates`, `loadFocusData`, `loadLastUpdated`) + 1 sync (`isDataStale`).
- No dead code, no unused imports, no side effects at module level.
- `isDataStale` handles null/undefined `lastUpdated` and invalid timestamps gracefully (returns `true`).

### 2.3 src/lib/formatters.js -- PASS

- 5 exports: `formatBRL`, `formatPercent`, `formatDate`, `formatNumber`, `parseBRLInput`.
- Module-level `brlFormatter` and `dateFormatter` are constants created via `Intl` constructors -- these are effectively side-effect-free singletons. Acceptable.
- `parseBRLInput` handles non-string input by returning `NaN`. Good.
- No dead code.

### 2.4 src/lib/bcb-api.js -- PASS with findings

- 3 public exports: `fetchSelic`, `fetchCDI`, `fetchTR`.
- Internal: `fetchBCBSerie`, `readCache`, `writeCache` (not exported -- good encapsulation).
- Uses `sessionStorage` which is browser-only. This means the module will throw if imported at SSR/build time and `sessionStorage` is accessed. However, the `readCache`/`writeCache` functions have try/catch guards, so SSR will gracefully fall back. **PASS**.
- AbortController + timeout: properly implemented with `clearTimeout` in `finally`. **PASS**.
- Hardcoded fallback values are present for all 3 series (432, 4389, 226). **PASS**.

**Minor style note**: `catch` blocks (lines 35, 52, 86) use bare `catch` without binding the error variable. This is valid modern JS syntax but differs from most linting defaults. Consistent within the file, so acceptable.

### 2.5 ESM consistency -- PASS

All `src/lib/*.js` files use `export function` (named exports). No default exports, no `module.exports`, no CommonJS. Data-loader uses `export async function` for its async variants. Tests import via named imports. Fully consistent ESM throughout.

### 2.6 Coding style consistency -- PASS with minor notes

- All files use JSDoc for documentation.
- Consistent 2-space indentation.
- Consistent use of `const`/`let` (no `var`).
- Arrow functions used only in callbacks, named `function` declarations for exports.
- Section separators (`// ---`) used consistently in calculator.js.
- Formatting of `formatters.js` `brlFormatter` uses `const` at module scope, while `formatPercent`/`formatNumber` create `Intl.NumberFormat` on every call. This is a minor performance inconsistency -- the BRL and date formatters are cached but percent/number formatters are not. Low priority.

---

## 3. Config Verification

### 3.1 astro.config.mjs -- PASS with note

```js
site: 'https://josesiqueira.github.io',
base: '/cooperforte-simulator',
output: 'static',
```

All three settings match the spec. Tailwind is integrated via `@tailwindcss/vite` plugin (Tailwind v4 approach) rather than the `@astrojs/tailwind` integration mentioned in the plan. This is a **valid alternative** -- Tailwind v4 uses its own Vite plugin. The plan's architectural decision says "Tailwind via `@astrojs/tailwind`" but the package.json uses `@tailwindcss/vite` + `tailwindcss` v4.2.2. This is actually the more modern approach and works correctly as proven by the successful build.

### 3.2 tailwind.config.mjs -- PASS with note

- `darkMode: 'class'` -- matches spec.
- `cooperforte: '#00A651'` -- matches spec.
- `content` array covers all Astro/JS/TS/Vue/Svelte file types.

**Note**: With Tailwind v4 and `@tailwindcss/vite`, the `tailwind.config.mjs` file may be partially or fully ignored in favor of CSS-based configuration (`@import 'tailwindcss'` in global.css). The build succeeds and the `text-cooperforte` class is present in the output HTML, so the config is being picked up -- but this should be verified more carefully when the UI is built in Phase 2. If Tailwind v4's CSS-first config takes precedence, the custom color and darkMode settings from `tailwind.config.mjs` may need to be migrated to `global.css` using `@theme` directives.

### 3.3 vitest.config.js -- PASS

```js
test: { include: ['tests/**/*.test.js'] }
```

Correctly scoped to the `tests/` directory. Matches the project structure.

### 3.4 package.json -- PASS

- `"type": "module"` -- enables ESM.
- `engines.node >= 22.12.0` -- appropriate.
- Scripts: `dev`, `build`, `preview`, `astro`, `test` -- all present.
- Dependencies: `astro@^6.0.6`, `chart.js@^4.5.1`, `tailwindcss@^4.2.2`, `@tailwindcss/vite@^4.2.2`.
- DevDependencies: `vitest@^4.1.0`.
- No unnecessary or phantom dependencies.

---

## 4. Integration Between Files

### 4.1 data-loader.js + cooperforte-rates.json -- PASS

`loadCooperforteRates()` fetches the JSON and returns it as-is. The JSON contains `investimentos`, `emprestimos`, `sobras`, `ir_regressivo` at the top level. Consumers will need to access:
- `rates.ir_regressivo` for `calcularIR(bruto, dias, tabela)` -- the `ir_regressivo` array has `{ate_dias, aliquota}` objects, which matches the `calcularIR` parameter type exactly.
- `rates.emprestimos.consignado_direto.taxa_am` for loan rates -- these are in percent (e.g., `1.49`), so consumers must divide by 100 before passing to `parcelaPrice(pv, taxaMensal, n)` which expects decimal (e.g., `0.0149`). **This is a known convention but a potential integration pitfall.** No helper exists to bridge this.
- `rates.investimentos.rdc_q.spread_aa` -- stored as `0.15` (percent), but `rendimentoPosFixado` expects `spreadAa` as decimal (e.g., `0.0015`). **BUG RISK**: The JSON stores `spread_aa: 0.15` which could be ambiguous -- is it 0.15% or 15%? The spec says "CDI+0,15%" so the intended value is 0.15 percentage points = 0.0015 in decimal. But the JSON stores `0.15`. Consumers must convert `spread_aa / 100` before passing to `rendimentoPosFixado`. This is not documented anywhere and is a **latent integration bug**.

### 4.2 data-loader.js + focus.json + construirTrajetoria -- INTEGRATION GAP

`focus.json` structure:
```json
{ "projecoes": { "2026": { "selic_fim": 12.25, ... }, ... } }
```

`construirTrajetoria(selicAtual, focus, trimestres)` expects:
```js
focus = { "2026": 12.25, "2027": 10.50, ... }
```

The raw `focus.json` wraps the projections in `.projecoes` and nests the selic value inside `.selic_fim`. So the caller must transform:
```js
const focusData = await loadFocusData(baseUrl);
const selicMap = {};
for (const [year, data] of Object.entries(focusData.projecoes)) {
  selicMap[year] = data.selic_fim;
}
construirTrajetoria(selicAtual, selicMap, trimestres);
```

This transformation is **not provided** by any utility function. The caller (Phase 2 UI code) will need to handle it. This is a **known integration seam** -- not a bug, but worth documenting.

### 4.3 formatters.js + calculator.js return values -- PASS

- `calculator.js` returns numbers (e.g., `{ bruto: number, fator: number }`).
- `formatters.js` accepts numbers: `formatBRL(number)`, `formatPercent(number)`, `formatNumber(number)`.
- Types are compatible. No mismatch.

**Note**: `formatPercent(valor, casas)` expects `valor` as a display-ready number (e.g., `14.90` for "14,90%"), not as a decimal (e.g., `0.149`). Calculator functions return decimals. So consumers must multiply by 100 before calling `formatPercent`. This is a **convention that must be known by Phase 2 code**. The JSDoc in formatters.js documents this: `@param {number} valor -- the numeric value (e.g. 14.9 for 14,90%)`.

### 4.4 bcb-api.js + calculator.js -- PASS with note

`fetchSelic()` returns `{ data: string, valor: string }` where `valor` is like `"14.900"`. The calculator expects numbers. Consumers must `parseFloat(result.valor)` and potentially divide by 100. This is another integration seam for Phase 2.

### 4.5 Naming consistency -- PASS

All module file names use kebab-case: `calculator.js`, `data-loader.js`, `formatters.js`, `bcb-api.js`. Function names use camelCase consistently. JSON field names use snake_case consistently. No mismatches between what files export and what tests import.

---

## 5. Spec Compliance

### 5.1 Calculator function signatures vs. COOPERFORTE-SIMULATOR-INSTRUCTIONS.md -- PASS

| Spec function | Implementation | Match |
|---|---|---|
| `rendimentoPosFixado(capital, cdiTrimestral, spreadAa, duPorTrimestre=63)` | Identical | YES |
| `rendimentoPreFixado(capital, taxaAa, duTotal)` | Identical | YES |
| `calcularIR(bruto, diasCorridos, tabela)` | Identical | YES |
| `sobrasDiscretas(capital, cdiPorExercicio, sobrasPctCdi, du=63)` | Identical | YES |
| `equivalenciaIsentoCDB(taxaIsenta, aliquotaIR)` | Identical | YES |
| `construirTrajetoria(selicAtual, focus, trimestres)` | Identical | YES |
| `construirCenarios(selicAtual, focus, trimestres)` | Identical | YES |
| `parcelaPrice(pv, taxaMensal, n)` | Identical | YES |
| `calcularIOF(pv, parcelas)` | Identical | YES |
| `calcularCET(valorRecebido, parcela, n)` | Identical | YES |
| `taxaMensalParaAnual(taxaMensal)` | Identical | YES |
| `custoComSobras(taxaAnual, devolucaoPP)` | Identical | YES |

All 12 functions match the spec signatures exactly.

### 5.2 JSON structures vs. spec -- PASS with minor deviation

**cooperforte-rates.json**: Matches spec exactly. All fields present, same nesting, same types. Minor cosmetic differences:
- Spec uses `"DINAMICO"` (with accent: `"DINAMICO"`); implementation uses `"DINAMICO"` (ASCII, no accent). This is intentional per the implementation (ASCII-safe). The `nota` field for `lfc_pre` uses `"DINAMICO — verificar cf.coop.br"` vs spec's `"DINAMICO -- verificar cf.coop.br"`. Same semantic, different encoding. **Acceptable.**
- Spec uses `"NAO garantido"` with accent on the A; implementation uses `"NAO garantido"` (ASCII). Same pattern. **Acceptable.**

**focus.json**: Matches spec exactly. Same `projecoes` structure with `selic_fim` and `ipca` per year.

**last-updated.json**: Matches spec. Has `timestamp`, `source`, `status`.

### 5.3 Reference values -- PASS (verified by tests)

| Formula | Expected | Test result |
|---|---|---|
| `parcelaPrice(10000, 0.01, 12)` | 888.49 | PASS |
| `calcularIOF(200000, 24)` | ~6746 | PASS |
| `taxaMensalParaAnual(0.0149)` | ~0.1942 | PASS |
| `equivalenciaIsentoCDB(85, 0.15)` | 100 | PASS |
| `equivalenciaIsentoCDB(90, 0.15)` | ~105.88 | PASS |
| `rendimentoPreFixado(100000, 0.1325, 504).bruto` | ~28255.63 | PASS |
| CET for 200k/24x/1.49% | ~0.0178 mensal | PASS |

---

## 6. Summary of Findings

### Blockers: 0

### Warnings (should fix before Phase 2): 2

1. **W-01: spread_aa unit ambiguity in cooperforte-rates.json**
   - `spread_aa: 0.15` in the JSON means 0.15 percentage points (i.e., CDI + 0.15% a.a.).
   - `rendimentoPosFixado` expects `spreadAa` in decimal form (0.0015).
   - Phase 2 UI code must divide `spread_aa / 100`. Consider adding a comment to the JSON or creating a normalization helper.

2. **W-02: focus.json requires transformation before passing to construirTrajetoria**
   - `construirTrajetoria` expects `{ "2026": 12.25, ... }` but `focus.json` has `{ projecoes: { "2026": { selic_fim: 12.25, ... } } }`.
   - Phase 2 must extract and flatten. Consider adding a helper in `data-loader.js`.

### Informational (low priority): 4

3. **I-01: `calcularIR` has no guard for missing bracket**
   - `tabela.find()` could return `undefined`. Current JSON avoids this with `ate_dias: 999999`.

4. **I-02: formatPercent expects display-ready values, not decimals**
   - Callers must multiply calculator results by 100 before formatting. Documented in JSDoc but easy to miss.

5. **I-03: Tailwind v4 config path**
   - `tailwind.config.mjs` works now, but Tailwind v4 prefers CSS-based config via `@theme`. Monitor in Phase 2 when custom colors are used more extensively. The `text-cooperforte` class appears in the build output, confirming the config file is being read.

6. **I-04: bcb-api.js returns string values**
   - `fetchSelic().valor` returns `"14.900"` (string). Callers must `parseFloat()` and scale appropriately.

### Acceptance Criteria Checklist

- [x] `npm run build` generates static site without errors
- [x] `npm test` passes all ~25 tests (26 passed)
- [x] `src/lib/calculator.js` exports all functions with correct signatures (12/12)
- [x] Reference values match spec
- [x] `src/lib/bcb-api.js` fetches Selic/CDI/TR with cache and fallback
- [x] `src/lib/formatters.js` formats BRL, percentages, dates in pt-BR
- [x] `src/lib/data-loader.js` loads all 3 JSON files and detects stale data
- [x] All 3 JSON files in `public/data/` have correct structure per spec
- [x] Placeholder `index.astro` renders (verified via build output)

**Phase 1 status: PASS -- ready to proceed to Phase 2.**
