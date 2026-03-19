# Cooperforte Simulator — Project Spec

> **Para Claude Code**: este documento é a especificação completa do projeto.
> Use seus planning agents para analisar este spec, decompor em fases,
> definir dependências e criar o plano de implementação.
> O spec define O QUÊ construir e as restrições — o COMO e a ordem ficam com vocês.

## Visão geral do projeto

Construir um simulador financeiro web focado exclusivamente nos produtos da **Cooperforte** (cooperativa de crédito brasileira), cobrindo **investimentos** (RDC-i, RDC-q, RDC-sq, LFC Pré, LFC Pós) e **empréstimos** (Consignado, MultiCrédito, Crédito Garantido, CredCooper40, Crédito do Trabalhador).

**Inspiração**: https://rendafixa.github.io/ (repo: https://github.com/rendafixa)
**Deploy**: GitHub Pages (josesiqueira.github.io/cooperforte-simulator)
**Custo**: zero — tudo grátis (GitHub Pages + GitHub Actions + APIs públicas)

### Restrições técnicas
- GitHub Pages: estático, sem backend, sem server-side rendering
- Zero custo de hosting/infra (GitHub free tier)
- APIs externas: somente públicas e gratuitas (BCB)
- Scraping: via GitHub Actions (2.000 min/mês grátis)
- Mobile-first, dark mode, português brasileiro

---

## Arquitetura

### Stack recomendada (planning agents podem ajustar)

- **Frontend**: Astro (SSG — gera HTML estático, deploy direto no GH Pages)
- **UI**: Tailwind CSS via CDN ou integrado ao Astro
- **Gráficos**: Chart.js 4.x
- **Cálculos**: módulo JS puro (sem dependências), testável
- **Scraping**: Python 3 (requests + BeautifulSoup4) rodando em GitHub Actions
- **Dados ao vivo**: fetch direto da API do Banco Central do Brasil (browser-side, sem CORS)
- **Idioma**: português brasileiro (interface, labels, tooltips, tudo)

### Estrutura de arquivos

```
cooperforte-simulator/
├── .github/
│   └── workflows/
│       └── update-rates.yml        # GitHub Action: scraping diário
├── public/
│   └── data/
│       ├── cooperforte-rates.json  # taxas atuais (atualizado pelo Action)
│       ├── focus.json              # projeções Focus (atualizado pelo Action)
│       └── last-updated.json       # { "timestamp": "2026-03-18T12:00:00Z", "source": "cf.coop.br" }
├── scripts/
│   ├── scrape-cooperforte.py       # scraping cf.coop.br
│   ├── fetch-focus.py              # busca Focus via API BCB
│   └── requirements.txt            # requests, beautifulsoup4, lxml
├── src/
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   ├── index.astro             # landing / dashboard
│   │   ├── investimentos.astro     # simulador de investimentos
│   │   └── emprestimos.astro       # simulador de empréstimos
│   ├── components/
│   │   ├── InvestmentSimulator.astro
│   │   ├── LoanSimulator.astro
│   │   ├── RateInputs.astro        # campos editáveis Selic/CDI/taxas
│   │   ├── ScenarioSelector.astro  # seletor 3 cenários
│   │   ├── ResultsTable.astro
│   │   ├── ComparisonChart.astro
│   │   └── StaleBanner.astro       # aviso "dados podem estar desatualizados"
│   ├── lib/
│   │   ├── calculator.js           # motor de cálculo (Price, cenários, CET, IOF)
│   │   ├── bcb-api.js              # fetch Selic/CDI do BCB em tempo real
│   │   ├── data-loader.js          # carrega cooperforte-rates.json + focus.json
│   │   └── formatters.js           # formatação BRL, percentuais, datas
│   └── styles/
│       └── global.css
├── tests/
│   └── calculator.test.js          # testes unitários das fórmulas
├── astro.config.mjs
├── package.json
├── tailwind.config.mjs
└── README.md
```

---

## Dados e fontes

### Camada 1 — Selic e CDI (browser-side, tempo real)

API do Banco Central, pública, sem auth, sem CORS:

```javascript
// Selic meta (última decisão Copom)
const SELIC_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json';
// CDI anualizado
const CDI_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json';
// TR mensal
const TR_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.226/dados/ultimos/1?formato=json';

// Resposta: [{"data":"18/03/2026","valor":"14.900"}]
```

Implementar em `src/lib/bcb-api.js`:
- Fetch com timeout de 5s
- Cache em sessionStorage por 1h
- Fallback para último valor conhecido se API falhar

### Camada 2 — Taxas Cooperforte (GitHub Action + JSON)

Formato do `cooperforte-rates.json`:

```json
{
  "updated_at": "2026-03-18T12:00:00Z",
  "source": "cf.coop.br",
  "investimentos": {
    "rdc_i": { "taxa_cdi_pct": 100, "min_aplicacao": 200, "prazo_min": 24, "prazo_max": 60, "fgcoop": true },
    "rdc_q": { "taxa_cdi_pct": 100, "spread_aa": 0.15, "min_aplicacao": 100000, "prazo_min": 24, "prazo_max": 60, "fgcoop": true },
    "rdc_sq": { "taxa_cdi_pct": 100, "spread_aa": 0.35, "min_aplicacao": 1000000, "prazo_min": 24, "prazo_max": 60, "fgcoop": true },
    "lfc_pos": { "taxa_cdi_pct": 100, "spread_aa": 0.40, "min_aplicacao": 100000, "prazo_fixo": 24, "fgcoop": false },
    "lfc_pre": { "taxa_aa": null, "nota": "DINÂMICO — verificar cf.coop.br", "min_aplicacao": 100000, "prazo_fixo": 24, "fgcoop": false }
  },
  "emprestimos": {
    "consignado_direto": { "taxa_am": 1.49, "prazo_min": 4, "prazo_max": 96, "desconto": "folha" },
    "consignado_portabilidade": { "taxa_am": 1.35, "prazo_min": 4, "prazo_max": 96, "desconto": "folha" },
    "credito_inicial": { "taxa_am": 1.42, "prazo_min": 4, "prazo_max": 48, "valor_max": 40000 },
    "multicredito": { "taxa_am": 2.19, "prazo_min": 4, "prazo_max": 96 },
    "credito_garantido": { "taxa_am": 1.42, "indexador": "TR", "prazo_min": 4, "prazo_max": 60, "garantia_pct": 110 },
    "credcooper40": { "taxa_am": 1.55, "prazo_min": 4, "prazo_max": 60, "status": "verificar_disponibilidade" },
    "credito_trabalhador": { "taxa_am": null, "nota": "DINÂMICO", "desconto": "folha_esocial" }
  },
  "sobras": {
    "investimentos_cdi_pct": 116.1,
    "emprestimos_devolucao_pp_aa": 1.50,
    "ano_referencia": 2024,
    "nota": "NÃO garantido — depende do resultado anual e assembleia"
  },
  "ir_regressivo": [
    { "ate_dias": 180, "aliquota": 22.5 },
    { "ate_dias": 360, "aliquota": 20.0 },
    { "ate_dias": 720, "aliquota": 17.5 },
    { "ate_dias": 999999, "aliquota": 15.0 }
  ]
}
```

### Camada 3 — Projeções Focus (GitHub Action)

API pública do BCB para expectativas Focus:
```
https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$filter=Indicador eq 'Selic' and DataReferencia ge '2026-01-01'&$format=json
```

Formato do `focus.json`:

```json
{
  "updated_at": "2026-03-18",
  "projecoes": {
    "2026": { "selic_fim": 12.25, "ipca": 4.10 },
    "2027": { "selic_fim": 10.50, "ipca": 3.80 },
    "2028": { "selic_fim": 10.00, "ipca": 3.50 },
    "2029": { "selic_fim": 9.50, "ipca": 3.50 }
  }
}
```

---

## Motor de cálculo (`src/lib/calculator.js`)

Exportar funções puras, testáveis, sem side effects.

### Investimentos

```javascript
/**
 * Rendimento pós-fixado com CDI variável por trimestre
 * @param {number} capital - valor inicial
 * @param {number[]} cdiTrimestral - CDI anualizado de cada trimestre (ex: [0.149, 0.139, ...])
 * @param {number} spreadAa - spread anual (ex: 0.0015 para CDI+0,15%)
 * @param {number} duPorTrimestre - dias úteis por trimestre (default 63)
 * @returns {{ bruto: number, fator: number }}
 */
export function rendimentoPosFixado(capital, cdiTrimestral, spreadAa, duPorTrimestre = 63) {
  let fator = 1;
  for (const cdi of cdiTrimestral) {
    fator *= Math.pow(1 + cdi + spreadAa, duPorTrimestre / 252);
  }
  return { bruto: capital * (fator - 1), fator };
}

/**
 * Rendimento prefixado
 * @param {number} capital
 * @param {number} taxaAa - taxa anual (ex: 0.1325)
 * @param {number} duTotal - dias úteis totais
 * @returns {{ bruto: number, fator: number }}
 */
export function rendimentoPreFixado(capital, taxaAa, duTotal) {
  const fator = Math.pow(1 + taxaAa, duTotal / 252);
  return { bruto: capital * (fator - 1), fator };
}

/**
 * IR regressivo
 * @param {number} bruto - rendimento bruto
 * @param {number} diasCorridos - prazo em dias corridos
 * @param {Array<{ate_dias: number, aliquota: number}>} tabela
 * @returns {{ ir: number, aliquota: number, liquido: number }}
 */
export function calcularIR(bruto, diasCorridos, tabela) {
  const faixa = tabela.find(f => diasCorridos <= f.ate_dias);
  const aliquota = faixa.aliquota / 100;
  const ir = bruto * aliquota;
  return { ir, aliquota: faixa.aliquota, liquido: bruto - ir };
}

/**
 * Sobras anuais discretas
 * Sobras são pagas 1x/ano (~abril), proporcionais ao CDI do exercício.
 * @param {number} capital
 * @param {number[][]} cdiPorExercicio - array de arrays, cada sub-array = trimestres do exercício
 * @param {number} sobrasPctCdi - ex: 0.161 para 116,1% CDI
 * @param {number} du - DU por trimestre (63)
 * @returns {{ total: number, porAno: number[] }}
 */
export function sobrasDiscretas(capital, cdiPorExercicio, sobrasPctCdi, du = 63) {
  let saldo = capital;
  const porAno = [];
  for (const trimestres of cdiPorExercicio) {
    let fatorEx = 1;
    for (const cdi of trimestres) {
      fatorEx *= Math.pow(1 + cdi, du / 252);
    }
    const rendCdi = saldo * (fatorEx - 1);
    const sobrasAno = rendCdi * sobrasPctCdi;
    porAno.push(sobrasAno);
    saldo *= fatorEx; // saldo cresce para o próximo exercício
  }
  return { total: porAno.reduce((a, b) => a + b, 0), porAno };
}

/**
 * Equivalência LCI/LCA vs CDB
 * @param {number} taxaIsenta - ex: 90 (90% CDI)
 * @param {number} aliquotaIR - ex: 0.15
 * @returns {number} CDB equivalente em % CDI
 */
export function equivalenciaIsentoCDB(taxaIsenta, aliquotaIR) {
  return taxaIsenta / (1 - aliquotaIR);
}

/**
 * Construir trajetória Selic trimestral a partir dos pontos Focus
 * Interpola linearmente entre pontos-âncora.
 * @param {number} selicAtual - Selic hoje (ex: 15.00)
 * @param {Object} focus - { "2026": 12.25, "2027": 10.50, ... }
 * @param {number} trimestres - quantos trimestres simular
 * @returns {number[]} Selic de cada trimestre
 */
export function construirTrajetoria(selicAtual, focus, trimestres) {
  // Implementar interpolação linear entre pontos anuais
  // Distribuir cortes em degraus de ~0,25-0,50 p.p.
  // Retornar array de tamanho `trimestres`
}

/**
 * Construir 3 cenários a partir do Focus
 * @param {number} selicAtual
 * @param {Object} focus
 * @param {number} trimestres
 * @returns {{ acelerado: number[], base: number[], gradual: number[] }}
 */
export function construirCenarios(selicAtual, focus, trimestres) {
  // Cenário Base: usa Focus direto
  // Cenário Acelerado: Selic fim de cada ano = Focus - 0,75 p.p.
  // Cenário Gradual: Selic fim de cada ano = Focus + 0,75 p.p.
  // Retornar 3 trajetórias
}
```

### Empréstimos

```javascript
/**
 * Parcela Price (PMT)
 * @param {number} pv - valor do empréstimo
 * @param {number} taxaMensal - taxa mensal decimal (ex: 0.0149)
 * @param {number} n - número de parcelas
 * @returns {number} valor da parcela
 */
export function parcelaPrice(pv, taxaMensal, n) {
  if (taxaMensal === 0) return pv / n;
  return pv * (taxaMensal * Math.pow(1 + taxaMensal, n)) / (Math.pow(1 + taxaMensal, n) - 1);
}

/**
 * IOF sobre empréstimo PF
 * Decreto 12.499/2025 (confirmado STF):
 * - Fixo (adicional): 0,38% sobre valor total
 * - Diário: 0,0082% por dia, limitado a 365 dias
 * @param {number} pv - valor do empréstimo
 * @param {number} parcelas - número de parcelas
 * @returns {number} IOF total
 */
export function calcularIOF(pv, parcelas) {
  const IOF_FIXO = 0.0038;
  const IOF_DIARIO = 0.000082;
  const dias = Math.min(parcelas * 30, 365);
  return pv * IOF_FIXO + pv * IOF_DIARIO * dias;
}

/**
 * CET — Custo Efetivo Total (Resolução BCB 3517)
 * Taxa que iguala valor recebido com fluxo de pagamentos.
 * Resolvido por bisseção.
 * @param {number} valorRecebido - PV (o que cai na conta)
 * @param {number} parcela - parcela mensal (calculada sobre PV + IOF)
 * @param {number} n - número de parcelas
 * @returns {{ mensal: number, anual: number }}
 */
export function calcularCET(valorRecebido, parcela, n) {
  let lo = 0.0001, hi = 0.15;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    let vp = 0;
    for (let k = 1; k <= n; k++) vp += parcela / Math.pow(1 + mid, k);
    if (vp > valorRecebido) lo = mid; else hi = mid;
  }
  const mensal = (lo + hi) / 2;
  const anual = Math.pow(1 + mensal, 12) - 1;
  return { mensal, anual };
}

/**
 * Taxa mensal para anual (capitalização composta)
 */
export function taxaMensalParaAnual(taxaMensal) {
  return Math.pow(1 + taxaMensal, 12) - 1;
}

/**
 * Custo efetivo com sobras (devolução de juros)
 * @param {number} taxaAnual - taxa anual nominal
 * @param {number} devolucaoPP - pontos percentuais devolvidos (ex: 0.015)
 * @returns {{ taxaAnualEfetiva: number, taxaMensalEfetiva: number }}
 */
export function custoComSobras(taxaAnual, devolucaoPP) {
  const efetiva = taxaAnual - devolucaoPP;
  return {
    taxaAnualEfetiva: efetiva,
    taxaMensalEfetiva: Math.pow(1 + efetiva, 1/12) - 1
  };
}
```

### Testes (`tests/calculator.test.js`)

Casos de teste obrigatórios:

```javascript
// Price
assert(Math.abs(parcelaPrice(10000, 0.01, 12) - 888.49) < 0.01);

// IOF
assert(Math.abs(calcularIOF(200000, 24) - 6746) < 1);

// CET
const iof = calcularIOF(200000, 24);
const parc = parcelaPrice(200000 + iof, 0.0149, 24);
const cet = calcularCET(200000, parc, 24);
assert(Math.abs(cet.mensal - 0.0178) < 0.001);

// Equivalência LCI/CDB
assert(Math.abs(equivalenciaIsentoCDB(85, 0.15) - 100) < 0.1);
assert(Math.abs(equivalenciaIsentoCDB(90, 0.15) - 105.88) < 0.1);

// Rendimento pré
const pre = rendimentoPreFixado(100000, 0.1325, 504);
assert(Math.abs(pre.bruto - 28255.63) < 1);

// Taxa mensal→anual
assert(Math.abs(taxaMensalParaAnual(0.0149) - 0.1942) < 0.001);
```

---

## GitHub Action: scraping automático

### `.github/workflows/update-rates.yml`

```yaml
name: Update Cooperforte Rates
on:
  schedule:
    - cron: '0 12 * * 1-5'  # segunda a sexta, 12h UTC (9h BRT)
  workflow_dispatch:           # permite rodar manualmente

jobs:
  update:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r scripts/requirements.txt
      - run: python scripts/scrape-cooperforte.py
      - run: python scripts/fetch-focus.py
      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add public/data/
          git diff --cached --quiet || git commit -m "chore: update rates $(date -u +%Y-%m-%d)"
          git push
```

### `scripts/scrape-cooperforte.py`

```python
# Tentar scraping de cf.coop.br/produtos-e-diferenciais/credito/
# e cf.coop.br/produtos-e-beneficios/
# Extrair taxas com BeautifulSoup
# Se falhar: manter JSON anterior, logar erro
# Sempre atualizar last-updated.json com timestamp e status
#
# Targets de scraping:
# - Taxas de empréstimo: procurar padrões como "X,XX% a.m." no HTML
# - Taxas de investimento: procurar "CDI + X,XX%", "X% do CDI"
# - LFC Pré: provavelmente não aparece no site (muda por emissão)
#
# Fallback: se scraping falhar, manter cooperforte-rates.json intacto
# e atualizar last-updated.json com { "status": "scrape_failed", ... }
```

### `scripts/fetch-focus.py`

```python
# Usar API OLINDA do BCB:
# https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/
# ExpectativasMercadoAnuais?$filter=Indicador eq 'Selic'&$format=json
#
# Extrair mediana da Selic para cada ano futuro
# Salvar em public/data/focus.json
```

---

## Interface — Páginas e componentes

### Landing page (`/`)

Dashboard com cards mostrando:
- Selic atual (live da API BCB)
- CDI atual (live)
- Data da última atualização das taxas Cooperforte
- Link para simulador de investimentos
- Link para simulador de empréstimos

### Simulador de investimentos (`/investimentos`)

**Inputs (painel esquerdo ou topo)**:
- Valor do investimento (slider + campo numérico, R$ 200 a R$ 2.000.000)
- Prazo em meses (slider, 1 a 60)
- Produto (dropdown: RDC-i, RDC-q, RDC-sq, LFC Pós, LFC Pré, ou "Comparar todos")
- Cenário Selic (radio: Cortes Acelerados / Base Focus / Cortes Graduais)
- Toggle: incluir sobras (default: off)
- Campos editáveis (colapsáveis, "Ajustar taxas"):
  - Selic (auto-preenchido BCB, editável)
  - CDI (auto-preenchido BCB, editável)
  - Taxa de cada produto (auto-preenchido JSON, editável)
  - LFC Pré (campo obrigatório se selecionado — não tem default confiável)
  - % de sobras sobre CDI (default 116,1%, editável)

**Outputs**:
- Cards métricas: rendimento bruto, IR, rendimento líquido, total na conta
- Tabela comparativa (todos os produtos × cenários)
- Gráfico de barras empilhadas (principal + rendimento + sobras, por produto)
- Gráfico de linha: trajetória da Selic nos 3 cenários
- Nota de rodapé: data dos dados, fonte, disclaimer

**Lógica de cálculo**:
- Se prazo ≤ 6 meses: CDI constante (atual), sem cenários
- Se prazo > 6 meses: usar cenários Selic variável (trimestral)
- Sobras: modelo discreto anual (1 pagamento por exercício)
- IR: tabela regressiva baseada no prazo em dias corridos
- FGCoop: alertar se valor > R$ 250k
- LFC: alertar que prazo fixo é 24m, se prazo ≠ 24 sugerir RDC

### Simulador de empréstimos (`/emprestimos`)

**Inputs**:
- Valor do empréstimo (slider + campo, R$ 1.000 a R$ 500.000)
- Prazo em parcelas (slider, 4 a 96)
- Produto (dropdown ou "Comparar todos")
- Campos editáveis (colapsáveis):
  - Taxa de cada produto (auto-preenchido JSON, editável)
  - TR mensal (auto-preenchido BCB, editável)
  - IOF fixo e diário (default: 0,38% e 0,0082%)
  - Devolução de sobras em p.p. (default: 1,50)

**Outputs**:
- Cards métricas: melhor parcela, menor total, menor CET
- Tabela ranking (por total pago crescente):
  - Produto | Taxa a.m. | Parcela | Total | Juros | CET a.m. | CET a.a.
- Gráfico de barras horizontais empilhadas (principal + IOF + juros, por produto)
- Seção "Com sobras": custo efetivo estimado com devolução
- Nota: produtos indisponíveis para o valor/prazo ficam cinza com explicação
- Rodapé: IOF estimado, disclaimer

**Lógica**:
- Parcela: Tabela Price sobre (PV + IOF)
- IOF: 0,38% fixo + 0,0082%/dia × min(prazo×30, 365)
- CET: bisseção — taxa que iguala PV (recebido) com fluxo de parcelas
- Filtrar produtos: Crédito Inicial max R$ 40k; Garantido max 60 parcelas; etc
- Crédito Garantido: adicionar TR à taxa base

---

## Design

### Estética
- Clean, profissional, inspirado em fintechs brasileiras (Nubank, Rico, XP)
- Fundo claro, cards com bordas sutis, tipografia limpa
- Cores da Cooperforte: verde (#00A651 — verificar brand guide) como accent
- Dark mode support
- Mobile-first (funcionar bem no celular)

### Elementos visuais
- Cada produto tem um badge colorido (RDC = verde/FGCoop, LFC = amarelo/sem FGCoop)
- Slider customizado com valor em tempo real
- Gráficos Chart.js com tooltip detalhado
- Banner de "dados desatualizados" se JSON > 7 dias
- Ícone de cadeado ao lado de campos auto-preenchidos (clique para editar)

### Responsividade
- Desktop: painel de inputs à esquerda, resultados à direita
- Mobile: inputs no topo, resultados abaixo (scroll)
- Tabelas: scroll horizontal no mobile se necessário

---

## Deploy no GitHub Pages

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://josesiqueira.github.io',
  base: '/cooperforte-simulator',
  integrations: [tailwind()],
  output: 'static',
});
```

GitHub Pages config: source = GitHub Actions (Astro tem action oficial).

---

---

## Valores de referência para testes (março 2026)

### Investimento R$ 200k, 24 meses, cenário Base:
- RDC-i sem sobras: R$ 243.314 líquido
- RDC-q sem sobras: R$ 243.886 líquido
- LFC Pré 13,25% sem sobras: R$ 248.035 líquido
- RDC-q com sobras: ~R$ 250.245 líquido (sobras discretas)

### Empréstimo R$ 200k, 24 parcelas:
- IOF: R$ 6.746
- Consignado 1,49%: parcela R$ 10.310, CET 1,78% a.m.
- Portabilidade 1,35%: parcela R$ 10.143, CET 1,64% a.m.
- MultiCrédito 2,19%: parcela R$ 11.168, CET 2,49% a.m.

### Fórmulas de validação:
- PMT(10000, 1%, 12) = 888,49
- (1,0149)^12 - 1 = 19,42% a.a.
- LCI 85% CDI / (1 - 0,15) = 100% CDI equivalente
- (1,005)^12 - 1 = 6,17% (poupança)

---

## Notas importantes

1. **Todos os valores numéricos são dinâmicos** — a interface deve deixar claro a data da última atualização e permitir edição manual de qualquer taxa
2. **Sobras NÃO são garantidas** — sempre mostrar cenário com e sem sobras separadamente
3. **FGCoop: limite R$ 250k** — alertar quando valor exceder
4. **LFC Pré não tem taxa pública confiável** — campo sempre começa vazio, usuário precisa preencher
5. **IOF muda por decreto** — campos de alíquota devem ser editáveis
6. **O simulador NÃO é recomendação financeira** — disclaimer visível em todas as páginas
