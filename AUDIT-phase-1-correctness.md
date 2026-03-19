# Phase 1 Audit: Correctness & Acceptance Criteria

**Date**: 2026-03-19
**Auditor**: QA (automated)
**Scope**: Phase 1 — Core Engine & Data Layer

---

## Summary

| # | Criterion | Verdict | Notes |
|---|-----------|---------|-------|
| 1 | `npm run build` generates static site without errors | **PASS** | Build completes in ~1.4s, produces `dist/index.html` |
| 2 | `npm test` passes all ~25 tests | **PASS** | 26 tests across 1 file, all passing (Vitest v4.1.0, 222ms) |
| 3 | `src/lib/calculator.js` exports all 11+ functions with correct signatures | **PASS** | 12 exported functions found (see detail below) |
| 4 | Reference values match spec | **PASS** | All 3 reference values verified (see detail below) |
| 5 | `src/lib/bcb-api.js` fetches Selic/CDI/TR with cache and fallback | **PASS** | Cache (sessionStorage, 1h TTL), timeout (AbortController 5s), hardcoded fallbacks all present |
| 6 | `src/lib/formatters.js` formats BRL, percentages, dates in pt-BR | **PASS** | All 5 functions present and use `Intl.NumberFormat('pt-BR', ...)` / `Intl.DateTimeFormat('pt-BR', ...)` |
| 7 | `src/lib/data-loader.js` loads all 3 JSON files and detects stale data | **PASS** | `loadCooperforteRates`, `loadFocusData`, `loadLastUpdated`, `isDataStale(lastUpdated, maxDays=7)` all exported |
| 8 | All 3 JSON files in `public/data/` have correct structure per spec | **PASS** | All required sections present (see detail below) |
| 9 | Placeholder `index.astro` renders via build output | **PASS** | `dist/index.html` contains rendered content with lang="pt-BR" |

**Overall: 9/9 PASS**

---

## Detailed Evidence

### Criterion 1: `npm run build`

```
> astro build
[build] output: "static"
[build] 1 page(s) built in 1.37s
[build] Complete!
```

Exit code 0. Output directory `dist/` contains `index.html`, `data/`, `_astro/`, favicons.

### Criterion 2: `npm test`

```
Test Files  1 passed (1)
     Tests  26 passed (26)
  Duration  222ms
```

26 tests cover all 12 calculator functions across 11 describe blocks.

### Criterion 3: Exported functions (12 total)

| Function | Signature matches spec? |
|----------|------------------------|
| `rendimentoPosFixado(capital, cdiTrimestral, spreadAa, duPorTrimestre=63)` | YES |
| `rendimentoPreFixado(capital, taxaAa, duTotal)` | YES |
| `calcularIR(bruto, diasCorridos, tabela)` | YES |
| `sobrasDiscretas(capital, cdiPorExercicio, sobrasPctCdi, du=63)` | YES |
| `equivalenciaIsentoCDB(taxaIsenta, aliquotaIR)` | YES |
| `construirTrajetoria(selicAtual, focus, trimestres)` | YES |
| `construirCenarios(selicAtual, focus, trimestres)` | YES |
| `parcelaPrice(pv, taxaMensal, n)` | YES |
| `calcularIOF(pv, parcelas)` | YES |
| `calcularCET(valorRecebido, parcela, n)` | YES |
| `taxaMensalParaAnual(taxaMensal)` | YES |
| `custoComSobras(taxaAnual, devolucaoPP)` | YES |

The spec lists 11 functions but the implementation correctly includes the 12th (`custoComSobras`) which is referenced in the spec's task description.

### Criterion 4: Reference values

Verified by running the functions directly in Node 22:

| Expression | Result | Expected | Delta | Verdict |
|------------|--------|----------|-------|---------|
| `parcelaPrice(10000, 0.01, 12)` | 888.4879 | ~888.49 | <0.01 | PASS |
| `calcularIOF(200000, 24)` | 6746.00 | ~6746 | <0.01 | PASS |
| `rendimentoPreFixado(100000, 0.1325, 504).bruto` | 28255.625 | ~28255.63 | <0.01 | PASS |

### Criterion 5: `bcb-api.js`

- **Cache**: `readCache` / `writeCache` use `sessionStorage` with key `bcb_{serieId}`, TTL = 3600000ms (1 hour). Expired entries are removed.
- **Timeout**: `AbortController` with 5000ms timeout via `setTimeout`.
- **Fallback**: `FALLBACK_VALUES` object with hardcoded values for series 432 (Selic), 4389 (CDI), 226 (TR). Used in the `catch` block.
- **Exports**: `fetchSelic()`, `fetchCDI()`, `fetchTR()` -- all present, all delegating to internal `fetchBCBSerie(serieId)`.

### Criterion 6: `formatters.js`

All 5 functions exported:

| Function | Locale | Verified |
|----------|--------|----------|
| `formatBRL(valor)` | `pt-BR`, style `currency`, `BRL` | YES |
| `formatPercent(valor, casas=2)` | `pt-BR`, appends `%` | YES |
| `formatDate(isoString)` | `pt-BR`, day/month/year, UTC timezone | YES |
| `formatNumber(valor, casas=2)` | `pt-BR` | YES |
| `parseBRLInput(str)` | Strips `R$`, reverses `,`/`.` | YES |

### Criterion 7: `data-loader.js`

All 4 functions exported:

- `loadCooperforteRates(baseUrl='')` -- fetches `/data/cooperforte-rates.json`
- `loadFocusData(baseUrl='')` -- fetches `/data/focus.json`
- `loadLastUpdated(baseUrl='')` -- fetches `/data/last-updated.json`
- `isDataStale(lastUpdated, maxDays=7)` -- compares `lastUpdated.timestamp` against `Date.now()`, returns `true` if age > 7 days or data is missing/invalid

### Criterion 8: JSON file structure

**`public/data/cooperforte-rates.json`**:
- `investimentos`: 5 products (rdc_i, rdc_q, rdc_sq, lfc_pos, lfc_pre) with taxa/spread/prazo/fgcoop fields
- `emprestimos`: 7 products (consignado_direto, consignado_portabilidade, credito_inicial, multicredito, credito_garantido, credcooper40, credito_trabalhador) with taxa_am/prazo fields
- `sobras`: investimentos_cdi_pct=116.1, emprestimos_devolucao_pp_aa=1.50, ano_referencia=2024
- `ir_regressivo`: 4 brackets (180d/22.5%, 360d/20%, 720d/17.5%, 999999d/15%)

**`public/data/focus.json`**:
- `projecoes`: 4 years (2026-2029) each with `selic_fim` and `ipca`

**`public/data/last-updated.json`**:
- `timestamp`: ISO 8601 string, `source`: "manual", `status`: "initial"

All match the spec requirements.

### Criterion 9: index.astro renders

Build output `dist/index.html` contains:
- `<html lang="pt-BR">`
- `<meta name="viewport" ...>` (responsive)
- `<title>Cooperforte Simulator</title>`
- Rendered heading and paragraph content
- Linked CSS file from Astro build pipeline

---

## Minor Observations (non-blocking)

1. **Test count**: The plan says "~25 tests" and there are 26. This exceeds the target -- no issue.
2. **IOF formula**: Uses Decreto 12.499/2025 rates (0.38% fixed + 0.0082%/day). The daily rate constant is `0.000082` in code which equals 0.0082% -- correct.
3. **`calcularIR` edge case**: If `diasCorridos` exceeds all `ate_dias` values in the table (no matching bracket), `find()` returns `undefined` and the function will throw. The `ir_regressivo` table has a sentinel value of 999999 which prevents this in practice.
4. **`bcb-api.js` SSR safety**: `sessionStorage` access is wrapped in try/catch for SSR environments where it is unavailable. Good defensive coding.

---

**Conclusion**: Phase 1 meets all 9 acceptance criteria. No failures detected.
