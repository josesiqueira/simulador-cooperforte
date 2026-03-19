# Claude Code Agents — Multi-Agent Orchestrators

## O que é

Dois sistemas de subagents + skills orquestradoras para Claude Code:

### 1. Phase Runner — Implementação
```
Spec → Planner → [3 Coders paralelo] → [3 Testers paralelo] → Fix → Repeat
```

### 2. Test Suite — Testes completos
```
Codebase → Test Planner → [3 Unit Testers paralelo + 1 Playwright E2E] → Fix → Report
```

## Instalação

Copie os arquivos para o repo do seu projeto:

```bash
# Na raiz do seu projeto
mkdir -p .claude/agents .claude/skills/phase-runner .claude/skills/test-suite

# Copiar os agents
cp agents/planner.md      .claude/agents/
cp agents/coder.md        .claude/agents/
cp agents/tester.md       .claude/agents/
cp agents/test-planner.md .claude/agents/
cp agents/unit-tester.md  .claude/agents/
cp agents/e2e-tester.md   .claude/agents/

# Copiar as skills
cp skills/phase-runner/SKILL.md  .claude/skills/phase-runner/
cp skills/test-suite/SKILL.md    .claude/skills/test-suite/
```

Estrutura final no seu projeto:

```
seu-projeto/
├── .claude/
│   ├── agents/
│   │   ├── planner.md          # decompõe spec em fases
│   │   ├── coder.md            # implementa código
│   │   ├── tester.md           # audita fases (usado pelo phase-runner)
│   │   ├── test-planner.md     # analisa codebase, cria TEST-IMPLEMENTATION-PLAN.md
│   │   ├── unit-tester.md      # escreve e roda Vitest (unit + component)
│   │   └── e2e-tester.md       # escreve e roda Playwright (E2E)
│   └── skills/
│       ├── phase-runner/
│       │   └── SKILL.md        # orquestra implementação por fases
│       └── test-suite/
│           └── SKILL.md        # orquestra pipeline de testes
├── SPEC.md                     # seu spec
└── ... (seu código)
```

## Como usar

### Implementar um projeto do zero

```
/phase-runner SPEC.md
```

O phase-runner chama o planner, divide em fases, e para cada fase lança 3 coders
→ 3 testers → fix loop → commit → próxima fase.

### Rodar testes (a qualquer momento)

```
/test-suite
```

O test-suite escaneia o codebase, cria/atualiza TEST-IMPLEMENTATION-PLAN.md com test cases
determinísticos, depois lança 3 unit-testers + 1 Playwright agent em paralelo.
Gera TEST-REPORT.md com pass rate, bugs, e recomendação.

### Fluxo combinado (recomendado)

O phase-runner pode invocar o test-suite ao final de cada fase automaticamente.
Basta dizer ao Claude Code:

```
/phase-runner SPEC.md — use /test-suite after each phase
```

## Os agents

### Implementação (phase-runner)
| Agent | Papel | Tools |
|-------|-------|-------|
| `planner` | Lê spec, cria IMPLEMENTATION-PLAN.md com fases | Read, Glob, Grep |
| `coder` | Implementa tasks de uma fase | Read, Edit, Write, Bash, Grep, Glob |
| `tester` | Audita fase (acceptance criteria) | Read, Grep, Glob, Bash |

### Testes (test-suite)
| Agent | Papel | Tools |
|-------|-------|-------|
| `test-planner` | Escaneia codebase, cria TEST-IMPLEMENTATION-PLAN.md | Read, Glob, Grep, Bash |
| `unit-tester` | Escreve e roda Vitest (unit + component) | Read, Write, Edit, Bash, Grep, Glob |
| `e2e-tester` | Escreve e roda Playwright (E2E + mobile) | Read, Write, Edit, Bash, Grep, Glob |

## Artefatos gerados

### Phase Runner
- `IMPLEMENTATION-PLAN.md` — plano de implementação
- `STATUS.md` — status de cada fase
- `AUDIT-phase-N.md` — auditoria por fase

### Test Suite
- `TEST-IMPLEMENTATION-PLAN.md` — test cases determinísticos (UT-xxx, CT-xxx, E2E-xxx)
- `TEST-RESULTS-unit.md` — resultados unit/component
- `TEST-RESULTS-e2e.md` — resultados Playwright
- `TEST-REPORT.md` — relatório consolidado
- `tests/unit/` — arquivos de teste Vitest
- `tests/components/` — testes de componente
- `tests/e2e/` — specs Playwright

## Customização

### Mudar número de agents

Edite o SKILL.md de cada orquestrador. O padrão é 3 coders + 3 testers
(phase-runner) e 3 unit-testers + 1 e2e-tester (test-suite).

### Mudar frameworks de teste

O default é Vitest (unit/component) + Playwright (E2E). Para mudar:
- Edite `unit-tester.md` — troque referências a Vitest por Jest/Mocha/etc
- Edite `e2e-tester.md` — troque Playwright por Cypress/etc

### Adicionar agents

Crie novos `.md` em `.claude/agents/` e referencie nos SKILL.md.
Exemplos: `a11y-tester.md` (axe-core), `perf-tester.md` (Lighthouse),
`security-scanner.md` (npm audit + OWASP checks).
