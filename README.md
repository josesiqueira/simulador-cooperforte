# Simulador Cooperforte

Simulador financeiro completo para produtos de investimento e credito da Cooperforte.

## Demo

[https://josesiqueira.github.io/simulador-cooperforte](https://josesiqueira.github.io/simulador-cooperforte)

## Funcionalidades

- **Simulador de investimentos** — RDC-i, RDC-q, RDC-sq, LFC Pre, LFC Pos com comparacao lado a lado
- **Simulador de emprestimos** — Consignado, Portabilidade, MultiCredito, Credito Garantido, CredCooper40, Credito do Trabalhador
- **Taxas ao vivo do Banco Central** — Selic, CDI e TR atualizados em tempo real via API BCB
- **3 cenarios Selic (Focus)** — Cortes Acelerados, Base Focus e Cortes Graduais com interpolacao trimestral
- **Calculo de sobras** — modelo discreto anual baseado no resultado 2024 (116,1% CDI)
- **Dark mode** — alternancia claro/escuro com persistencia
- **Mobile-first** — layout responsivo otimizado para celular e desktop

## Stack Tecnologica

| Camada | Tecnologia |
|--------|-----------|
| Framework | [Astro](https://astro.build/) (SSG) |
| Estilo | [Tailwind CSS](https://tailwindcss.com/) v4 |
| Graficos | [Chart.js](https://www.chartjs.org/) 4.x |
| Testes | [Vitest](https://vitest.dev/) |
| Scraping | Python 3.12 (requests + BeautifulSoup4) |
| CI/CD | GitHub Actions |
| Deploy | GitHub Pages |

## Como rodar localmente

### Pre-requisitos

- Node.js 22+
- Python 3.12+ (apenas para scripts de atualizacao de dados)

### Instalacao e desenvolvimento

```bash
# Instalar dependencias e iniciar servidor de desenvolvimento
npm install
npm run dev
```

O servidor estara disponivel em `http://localhost:4321`.

### Scripts de dados (opcional)

```bash
# Instalar dependencias Python
pip install -r scripts/requirements.txt

# Atualizar taxas da Cooperforte (scraping cf.coop.br)
python scripts/scrape-cooperforte.py

# Atualizar projecoes Focus (API BCB OLINDA)
python scripts/fetch-focus.py
```

### Testes

```bash
npm test
```

## Arquitetura

```
simulador-cooperforte/
├── .github/workflows/
│   ├── deploy.yml               # Deploy para GitHub Pages
│   └── update-rates.yml         # Atualizacao automatica de taxas
├── public/data/
│   ├── cooperforte-rates.json   # Taxas de investimentos e emprestimos
│   ├── focus.json               # Projecoes Selic/IPCA do Focus
│   └── last-updated.json        # Timestamp da ultima atualizacao
├── scripts/
│   ├── scrape-cooperforte.py    # Scraping de taxas do site Cooperforte
│   ├── fetch-focus.py           # Consulta API OLINDA (expectativas Focus)
│   └── requirements.txt         # Dependencias Python
├── src/
│   ├── components/              # Componentes Astro reutilizaveis
│   │   ├── InvestmentSimulator.astro
│   │   ├── LoanSimulator.astro
│   │   ├── ComparisonChart.astro
│   │   ├── ResultsTable.astro
│   │   ├── ScenarioSelector.astro
│   │   ├── RateInputs.astro
│   │   └── StaleBanner.astro
│   ├── layouts/
│   │   └── Layout.astro         # Layout base (header, nav, footer, dark mode)
│   ├── lib/
│   │   ├── calculator.js        # Motor de calculo (Price, IR, CET, IOF, cenarios)
│   │   ├── bcb-api.js           # Fetch Selic/CDI/TR da API BCB (cache 1h)
│   │   ├── data-loader.js       # Carrega JSONs de taxas e projecoes
│   │   └── formatters.js        # Formatacao BRL, percentuais, datas (pt-BR)
│   ├── pages/
│   │   ├── index.astro          # Landing page com dashboard
│   │   ├── investimentos.astro  # Simulador de investimentos
│   │   └── emprestimos.astro    # Simulador de emprestimos
│   └── styles/
│       └── global.css           # Tailwind directives + variaveis CSS
├── tests/
│   └── calculator.test.js       # Testes unitarios do motor de calculo
├── astro.config.mjs
├── tailwind.config.mjs
├── vitest.config.js
└── package.json
```

## Fontes de dados

| Fonte | Dados | Metodo |
|-------|-------|--------|
| [API BCB (SGS)](https://dadosabertos.bcb.gov.br/) | Selic meta, CDI anualizado, TR mensal | Fetch no browser (tempo real, sem CORS) |
| [API OLINDA (Focus)](https://olinda.bcb.gov.br/) | Projecoes anuais Selic e IPCA | Script Python via GitHub Actions |
| [cf.coop.br](https://cf.coop.br/) | Taxas de investimentos e emprestimos Cooperforte | Scraping Python via GitHub Actions |

## Atualizacao automatica

Uma GitHub Action (`update-rates.yml`) roda de **segunda a sexta as 9h BRT** (12h UTC) e executa:

1. `scrape-cooperforte.py` — coleta taxas atuais do site da Cooperforte
2. `fetch-focus.py` — consulta projecoes Focus do Banco Central

Se houver mudancas nos dados, um commit automatico e criado e o deploy e disparado.

Em caso de falha no scraping, os dados anteriores sao mantidos e o status e registrado em `last-updated.json`. Um banner de aviso aparece no site quando os dados tem mais de 7 dias.

## Deploy

O site e publicado automaticamente no **GitHub Pages** via a action oficial do Astro (`withastro/action@v5`).

O deploy e disparado a cada push na branch `main` e tambem pode ser executado manualmente via `workflow_dispatch`.

URL: [https://josesiqueira.github.io/simulador-cooperforte](https://josesiqueira.github.io/simulador-cooperforte)

## Disclaimer

> **Este simulador e uma ferramenta educacional e NAO constitui recomendacao financeira.**
> Os valores apresentados sao estimativas baseadas em dados publicos e podem divergir dos valores reais praticados pela Cooperforte.
> Sobras nao sao garantidas e dependem do resultado anual e aprovacao em assembleia.
> Consulte a Cooperforte para informacoes oficiais: [cf.coop.br](https://cf.coop.br/)

## Licenca

[MIT](LICENSE)
