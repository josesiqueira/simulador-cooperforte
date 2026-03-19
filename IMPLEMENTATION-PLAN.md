# Implementation Plan

Generated: 2026-03-19
Source spec: COOPERFORTE-SIMULATOR-INSTRUCTIONS.md
Total phases: 3

---

## Architectural Decisions

- **JavaScript ESM puro** (sem TypeScript) — spec pede "modulo JS puro, sem dependencias, testavel". JSDoc para tipos.
- **Vitest** para testes — compativel com ESM, rapido, zero config com Astro.
- **Tailwind via `@astrojs/tailwind`** (nao CDN) — CSS otimizado com purge.
- **Chart.js via npm** (nao CDN) — tree-shaking, controle de versao.
- **Vanilla JS** para reatividade (sem React/Vue) — estado central + event listeners + DOM updates.
- **Dados estaticos em `public/data/`** como JSON — servidos pelo build.

---

## Phase 1: Core Engine & Data Layer

**Goal**: Scaffold the Astro project, implement all calculation functions, data fetching, formatters, and validate with tests.
**Dependencies**: none
**Complexity**: high
**Parallel tasks**: After scaffolding (task 1), tasks 2-4 are independent and can run on 3 agents in parallel. Tasks 5-7 depend on tasks 2 and 4 respectively but can also be parallelized.

### Tasks

1. **Scaffolding** — Initialize Astro project with Tailwind, Chart.js, Vitest. Create folder structure, configs, placeholder pages.
   - Run: `npm create astro@latest . -- --template minimal` (in project root)
   - Run: `npx astro add tailwind`
   - Run: `npm install chart.js && npm install -D vitest`
   - Create `astro.config.mjs`: site=`https://josesiqueira.github.io`, base=`/simulador-cooperforte`, integrations=[tailwind()], output=`static`
   - Create `tailwind.config.mjs`: darkMode=`class`, extend colors cooperforte=`#00A651`
   - Create `vitest.config.js`
   - Create `src/styles/global.css` with Tailwind directives + CSS vars for dark mode
   - Create `src/layouts/Layout.astro` — basic HTML shell with slot, lang="pt-BR", meta viewport
   - Create `src/pages/index.astro` — minimal placeholder using Layout
   - Create folder structure: `src/lib/`, `src/components/`, `tests/`, `public/data/`, `scripts/`, `.github/workflows/`
   - Verify: `npm run build` succeeds

2. **Calculator module** — Create `src/lib/calculator.js` with all 11 pure functions.
   - `rendimentoPosFixado(capital, cdiTrimestral, spreadAa, duPorTrimestre=63)` — iterates quarters, compounds factor
   - `rendimentoPreFixado(capital, taxaAa, duTotal)` — `(1+taxa)^(du/252)`
   - `calcularIR(bruto, diasCorridos, tabela)` — finds bracket, applies rate
   - `sobrasDiscretas(capital, cdiPorExercicio, sobrasPctCdi, du=63)` — annual discrete surplus
   - `equivalenciaIsentoCDB(taxaIsenta, aliquotaIR)` — `taxa / (1-aliquota)`
   - `construirTrajetoria(selicAtual, focus, trimestres)` — linear interpolation between annual Focus points
   - `construirCenarios(selicAtual, focus, trimestres)` — base/accelerated/gradual (Focus +/- 0.75pp)
   - `parcelaPrice(pv, taxaMensal, n)` — PMT formula, special case taxa=0
   - `calcularIOF(pv, parcelas)` — 0.38% fixed + 0.0082%/day × min(n×30, 365)
   - `calcularCET(valorRecebido, parcela, n)` — bisection 100 iterations, returns {mensal, anual}
   - `taxaMensalParaAnual(taxaMensal)` — `(1+taxa)^12 - 1`
   - `custoComSobras(taxaAnual, devolucaoPP)` — effective rate after surplus return

3. **Static data files + data-loader + formatters** — Create JSON data files and utility modules.
   - Create `public/data/cooperforte-rates.json` — full structure from spec (investimentos, emprestimos, sobras, ir_regressivo)
   - Create `public/data/focus.json` — projecoes 2026-2029 (Selic + IPCA)
   - Create `public/data/last-updated.json` — `{ "timestamp": "2026-03-19T12:00:00Z", "source": "manual", "status": "initial" }`
   - Create `src/lib/data-loader.js` — `loadCooperforteRates(baseUrl)`, `loadFocusData(baseUrl)`, `loadLastUpdated(baseUrl)`, `isDataStale(lastUpdated, maxDays=7)`
   - Create `src/lib/formatters.js` — `formatBRL(valor)`, `formatPercent(valor, casas)`, `formatDate(isoString)`, `formatNumber(valor, casas)`, `parseBRLInput(str)`
   - Create `src/lib/bcb-api.js` — `fetchSelic()`, `fetchCDI()`, `fetchTR()` with internal `fetchBCBSerie(serieId)`: sessionStorage cache 1h, AbortController timeout 5s, hardcoded fallbacks

4. **Tests** — Create `tests/calculator.test.js` with ~25 tests covering all calculator functions.
   - `parcelaPrice`: PMT(10000, 0.01, 12)=888.49; taxa=0; n=1
   - `calcularIOF`: 200k/24x≈6746; prazo longo caps at 365 days
   - `calcularCET`: 200k/24x/1.49% → CET mensal≈0.0178; case without IOF
   - `equivalenciaIsentoCDB`: 85%/(1-0.15)=100%; 90%/(1-0.15)≈105.88%
   - `rendimentoPreFixado`: 100k, 13.25%, 504 DU → bruto≈28255.63
   - `rendimentoPosFixado`: constant CDI; variable CDI
   - `taxaMensalParaAnual`: 0.0149→≈0.1942; zero
   - `calcularIR`: one test per bracket (180d, 360d, 720d, >720d)
   - `sobrasDiscretas`: 1 year constant CDI; 2 years with accumulation
   - `custoComSobras`: nominal minus return
   - `construirTrajetoria`/`construirCenarios`: constant trajectory; acelerado < base < gradual; correct array length
   - Add `"test": "vitest run"` to package.json scripts
   - Verify: `npm test` passes all tests

### Acceptance criteria

- [ ] `npm run build` generates static site without errors
- [ ] `npm test` passes all ~25 tests
- [ ] `src/lib/calculator.js` exports all 11 functions with correct signatures
- [ ] Reference values from spec match: PMT(10000,0.01,12)≈888.49, IOF(200k,24)≈6746, Pre(100k,13.25%,504du)≈28255.63
- [ ] `src/lib/bcb-api.js` fetches Selic/CDI/TR from BCB API with cache and fallback
- [ ] `src/lib/formatters.js` formats BRL, percentages, dates correctly in pt-BR
- [ ] `src/lib/data-loader.js` loads all 3 JSON files and detects stale data (>7 days)
- [ ] All 3 JSON files in `public/data/` have correct structure per spec
- [ ] Placeholder `index.astro` renders in browser via `npm run dev`

### Files

- `package.json` (create)
- `astro.config.mjs` (create)
- `tailwind.config.mjs` (create)
- `vitest.config.js` (create)
- `src/styles/global.css` (create)
- `src/layouts/Layout.astro` (create)
- `src/pages/index.astro` (create)
- `src/lib/calculator.js` (create)
- `src/lib/bcb-api.js` (create)
- `src/lib/data-loader.js` (create)
- `src/lib/formatters.js` (create)
- `public/data/cooperforte-rates.json` (create)
- `public/data/focus.json` (create)
- `public/data/last-updated.json` (create)
- `tests/calculator.test.js` (create)

### Agent assignment (Phase 1)

> Task 1 (scaffolding) must complete first. Then 3 agents run in parallel:

| Agent | Tasks | Files owned |
|-------|-------|-------------|
| Coder A | Task 1 (scaffolding) + Task 2 (calculator.js) | `package.json`, `astro.config.mjs`, `tailwind.config.mjs`, `vitest.config.js`, `src/styles/global.css`, `src/layouts/Layout.astro`, `src/pages/index.astro`, `src/lib/calculator.js` |
| Coder B | Task 3 (data files + data-loader + formatters + bcb-api) | `public/data/*.json`, `src/lib/data-loader.js`, `src/lib/formatters.js`, `src/lib/bcb-api.js` |
| Coder C | Task 4 (tests) — waits for Coder A to finish calculator.js | `tests/calculator.test.js` |

> **Note**: Since Coder C depends on calculator.js, assign scaffolding + calculator to the same agent (Coder A) so Coder C can start as soon as the API is defined. Coder B is fully independent.

---

## Phase 2: UI — Pages & Components

**Goal**: Build all pages (landing, investimentos, emprestimos) and interactive components with Chart.js, dark mode, and responsive layout.
**Dependencies**: Phase 1
**Complexity**: high
**Parallel tasks**: Etapa 2a (base) should come first. Then components can be split: atomic components (agent A), InvestmentSimulator (agent B), LoanSimulator + pages (agent C).

### Tasks

1. **Layout & styles** — Enhance `Layout.astro` and `global.css` for production.
   - `src/styles/global.css`: add CSS vars for dark mode (--surface-bg, --surface-card, --text-primary, --text-secondary), Tailwind layers
   - `src/layouts/Layout.astro`: full header (logo, nav: Inicio|Investimentos|Emprestimos, dark mode toggle), main with container, footer with disclaimer, skip-to-content link, dark mode script with localStorage
   - `tailwind.config.mjs`: add font-family Inter, full cooperforte color scale

2. **Atomic components** — Create reusable sub-components.
   - `src/components/StaleBanner.astro`: hidden banner, script loads last-updated.json, shows if >7 days, role="alert"
   - `src/components/ScenarioSelector.astro`: fieldset with 3 styled radio cards (Acelerado/Base/Gradual)
   - `src/components/RateInputs.astro`: collapsible `<details>`, grid of number inputs with lock icon toggle, props type='investimentos'|'emprestimos'
   - `src/components/ResultsTable.astro`: responsive table, props id+type, highlight best product, opacity-50 for unavailable
   - `src/components/ComparisonChart.astro`: Chart.js canvas wrapper, props id+type+ariaLabel, dark mode observer

3. **InvestmentSimulator** — Full investment simulator component.
   - `src/components/InvestmentSimulator.astro`: grid layout (4+8 cols desktop, single col mobile)
   - Inputs: valor slider+number (R$200–R$2M), prazo slider (1–60m), produto select, ScenarioSelector, sobras toggle, RateInputs
   - Outputs: 4 metric cards, alerts (FGCoop >250k, LFC prazo, LFC Pre empty), ResultsTable, 2 charts (stacked bar + Selic line)
   - Script: state object, recalcular() on input, debounce 150ms, import calculator/bcb-api/data-loader/formatters/Chart.js
   - Logic: prazo<=6m hides scenarios, LFC Pre requires manual rate, sync sliders bidirectionally

4. **LoanSimulator** — Full loan simulator component.
   - `src/components/LoanSimulator.astro`: same grid layout pattern
   - Inputs: valor slider+number (R$1k–R$500k), prazo slider (4–96), produto select, RateInputs type='emprestimos'
   - Outputs: 3 metric cards (best parcela/total/CET), ResultsTable ranking, horizontal bar chart, "Com sobras" section
   - Script: same reactive pattern, import calculator/data-loader/formatters/Chart.js
   - Logic: filter products by constraints (Credito Inicial max R$40k, Garantido max 60x), Credito Garantido adds TR, unavailable products grayed out

5. **Pages** — Wire up all pages.
   - `src/pages/index.astro`: hero section, 4 live cards (Selic/CDI/TR/last-update via bcb-api.js), 2 link cards to simulators, StaleBanner
   - `src/pages/investimentos.astro`: Layout + StaleBanner + InvestmentSimulator
   - `src/pages/emprestimos.astro`: Layout + StaleBanner + LoanSimulator

### Acceptance criteria

- [ ] All 3 pages load and render correctly via `npm run dev`
- [ ] `npm run build` succeeds with all pages
- [ ] Dark mode toggles correctly on all components including Chart.js graphs
- [ ] Sliders and number inputs sync bidirectionally
- [ ] Investment calculations update in real-time when inputs change
- [ ] Loan calculations update in real-time when inputs change
- [ ] Chart.js graphs render and update without errors (bar, line, horizontal bar)
- [ ] Responsive layout works: mobile (single column) and desktop (grid)
- [ ] FGCoop alert shows when investment value > R$250k
- [ ] LFC alerts show for wrong prazo or missing rate
- [ ] Loan products filter correctly by value/prazo constraints
- [ ] Unavailable products show grayed out with explanation
- [ ] StaleBanner appears when data is older than 7 days

### Files

- `src/styles/global.css` (modify)
- `src/layouts/Layout.astro` (modify)
- `tailwind.config.mjs` (modify)
- `src/components/StaleBanner.astro` (create)
- `src/components/ScenarioSelector.astro` (create)
- `src/components/RateInputs.astro` (create)
- `src/components/ResultsTable.astro` (create)
- `src/components/ComparisonChart.astro` (create)
- `src/components/InvestmentSimulator.astro` (create)
- `src/components/LoanSimulator.astro` (create)
- `src/pages/index.astro` (modify)
- `src/pages/investimentos.astro` (create)
- `src/pages/emprestimos.astro` (create)

### Agent assignment (Phase 2)

| Agent | Tasks | Files owned |
|-------|-------|-------------|
| Coder A | Task 1 (layout/styles) + Task 2 (atomic components) | `global.css`, `Layout.astro`, `tailwind.config.mjs`, `StaleBanner`, `ScenarioSelector`, `RateInputs`, `ResultsTable`, `ComparisonChart` |
| Coder B | Task 3 (InvestmentSimulator) + Task 5 partially (investimentos.astro) | `InvestmentSimulator.astro`, `investimentos.astro` |
| Coder C | Task 4 (LoanSimulator) + Task 5 partially (emprestimos.astro + index.astro) | `LoanSimulator.astro`, `emprestimos.astro`, `index.astro` |

> **Note**: Coder A must finish atomic components before B and C can import them. Run A first (or A produces component shells, then B/C fill simulators in parallel).

---

## Phase 3: Scraping, CI/CD & Deploy

**Goal**: Automate data collection with Python scripts and GitHub Actions, configure deployment to GitHub Pages.
**Dependencies**: Phase 1 (needs public/data/ structure and package.json)
**Complexity**: medium
**Parallel tasks**: All 3 main tasks (scripts, workflows, README) are independent.

### Tasks

1. **Python scraping scripts** — Create scripts for data collection.
   - `scripts/requirements.txt`: requests>=2.31, beautifulsoup4>=4.12, lxml>=5.0
   - `scripts/scrape-cooperforte.py`:
     - GET cf.coop.br/produtos-e-diferenciais/credito/ with timeout 15s, honest User-Agent
     - Parse with BeautifulSoup + lxml
     - Extract rates via regex: `(\d{1,2}[,\.]\d{2})\s*%\s*a\.?\s*m\.?` for monthly rates, CDI patterns
     - Map keywords to JSON fields (consignado, portabilidade, multicredito, etc.)
     - 3-level fallback: success→update all, partial→update found fields only, failure→keep existing JSON
     - Validate ranges: monthly rates 0.5%-5.0%, CDI 80%-130%
     - Update `last-updated.json` with status
   - `scripts/fetch-focus.py`:
     - GET BCB OLINDA API for Selic and IPCA annual expectations
     - Group by year, take most recent median
     - Validate: Selic 5.0-25.0, IPCA 1.0-15.0
     - Retry once with 5s backoff, timeout 30s
     - Write `public/data/focus.json`
     - Fallback: keep existing file on error, exit 0

2. **GitHub Actions workflows** — Create CI/CD pipelines.
   - `.github/workflows/update-rates.yml`:
     - Schedule: cron `0 12 * * 1-5` (weekdays 12h UTC / 9h BRT)
     - workflow_dispatch for manual runs
     - Steps: checkout, setup Python 3.12 with pip cache, install deps, run scrape (continue-on-error), run fetch-focus (continue-on-error), conditional commit+push
     - timeout-minutes: 10
   - `.github/workflows/deploy.yml`:
     - Trigger: push to main + workflow_dispatch
     - Permissions: contents read, pages write, id-token write
     - Jobs: build with `withastro/action@v5`, deploy with `actions/deploy-pages@v4`

3. **README** — Create project documentation.
   - `README.md`: title, demo link (josesiqueira.github.io/simulador-cooperforte), features, tech stack, local dev instructions (Node 20+, Python 3.12+), architecture overview, data sources, auto-update explanation, deploy info, disclaimer, MIT license

### Acceptance criteria

- [ ] `pip install -r scripts/requirements.txt` installs without errors
- [ ] `python scripts/scrape-cooperforte.py` runs and either updates JSON or falls back gracefully (exit 0)
- [ ] `python scripts/fetch-focus.py` runs and generates valid `focus.json` (or falls back gracefully)
- [ ] `update-rates.yml` is valid YAML and can be triggered via workflow_dispatch
- [ ] `deploy.yml` is valid YAML and builds Astro site successfully
- [ ] `README.md` has all required sections (setup, usage, architecture, disclaimer)
- [ ] Full pipeline works: scraping → commit → deploy trigger

### Files

- `scripts/requirements.txt` (create)
- `scripts/scrape-cooperforte.py` (create)
- `scripts/fetch-focus.py` (create)
- `.github/workflows/update-rates.yml` (create)
- `.github/workflows/deploy.yml` (create)
- `README.md` (modify)

### Agent assignment (Phase 3)

| Agent | Tasks | Files owned |
|-------|-------|-------------|
| Coder A | Task 1 (Python scripts) | `scripts/requirements.txt`, `scripts/scrape-cooperforte.py`, `scripts/fetch-focus.py` |
| Coder B | Task 2 (GitHub Actions) | `.github/workflows/update-rates.yml`, `.github/workflows/deploy.yml` |
| Coder C | Task 3 (README) | `README.md` |

> All 3 agents are fully independent — run in parallel.

---

## Reference Values for Validation

From the spec (use in tests and audits):

| Formula | Expected |
|---------|----------|
| `parcelaPrice(10000, 0.01, 12)` | 888.49 |
| `calcularIOF(200000, 24)` | ~6746 |
| `taxaMensalParaAnual(0.0149)` | ~0.1942 (19.42% a.a.) |
| `equivalenciaIsentoCDB(85, 0.15)` | 100 |
| `equivalenciaIsentoCDB(90, 0.15)` | ~105.88 |
| `rendimentoPreFixado(100000, 0.1325, 504).bruto` | ~28255.63 |
| Investment R$200k, 24m, RDC-i, base scenario | ~R$243,314 liquid |
| Loan R$200k, 24x, Consignado 1.49% | parcela ~R$10,310, CET ~1.78% a.m. |
