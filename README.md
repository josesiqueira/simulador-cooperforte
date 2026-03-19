# Phase Runner — Multi-Agent Orchestrator for Claude Code

## O que é

Um sistema de 3 subagents + 1 skill orquestradora que implementa projetos automaticamente:

```
Spec → Planner → [3 Coders em paralelo] → [3 Testers em paralelo] → Fix → Repeat
```

## Instalação

Copie os arquivos para o repo do seu projeto:

```bash
# Na raiz do seu projeto
mkdir -p .claude/agents .claude/skills/phase-runner

# Copiar os agents
cp agents/planner.md  .claude/agents/
cp agents/coder.md    .claude/agents/
cp agents/tester.md   .claude/agents/

# Copiar a skill orquestradora
cp skills/phase-runner/SKILL.md  .claude/skills/phase-runner/
```

Estrutura final no seu projeto:

```
seu-projeto/
├── .claude/
│   ├── agents/
│   │   ├── planner.md       # decompõe spec em fases
│   │   ├── coder.md         # implementa código
│   │   └── tester.md        # audita e testa
│   └── skills/
│       └── phase-runner/
│           └── SKILL.md     # orquestra o loop
├── SPEC.md                  # seu spec (ex: COOPERFORTE-SIMULATOR-INSTRUCTIONS.md)
└── ... (seu código)
```

## Como usar

1. Coloque seu spec na raiz do projeto (ex: `SPEC.md`)
2. Abra Claude Code no projeto
3. Digite:

```
/phase-runner SPEC.md
```

4. O orquestrador vai:
   - Chamar o **planner** pra criar `PLAN.md` com fases
   - Mostrar o plano e pedir sua aprovação
   - Para cada fase: lançar **3 coders** em paralelo
   - Depois lançar **3 testers** em paralelo
   - Se testers acharem bugs: lançar **3 coders** pra consertar
   - Repetir até tudo passar
   - Commitar e ir pra próxima fase

5. Acompanhe o progresso em `STATUS.md` (atualizado automaticamente)

## Os agents

| Agent | Papel | Tools | Quando roda |
|-------|-------|-------|-------------|
| `planner` | Lê spec, cria PLAN.md com fases ordenadas | Read, Glob, Grep | 1x no início |
| `coder` | Implementa tasks de uma fase | Read, Edit, Write, Bash, Grep, Glob | 3x por fase |
| `tester` | Audita fase, roda testes, acha bugs | Read, Grep, Glob, Bash | 3x por fase |

## Artefatos gerados

- `PLAN.md` — plano de implementação com fases e acceptance criteria
- `STATUS.md` — status atualizado de cada fase
- `AUDIT-phase-N.md` — relatório de auditoria de cada fase

## Customização

### Mudar número de agents paralelos

Edite `.claude/skills/phase-runner/SKILL.md` — procure por "3 coder agents" e
ajuste para 2 (projetos pequenos) ou manter 3 (projetos médios/grandes).

### Mudar modelo dos agents

Edite o `model:` no frontmatter de cada agent:
- `sonnet` — padrão, bom balanço custo/qualidade
- `opus` — melhor qualidade, mais caro e lento
- `haiku` — mais rápido e barato, bom pra tester em projetos simples

### Adicionar agents especializados

Crie novos `.md` em `.claude/agents/` e referencie no `SKILL.md`.
Exemplos: `security-auditor.md`, `performance-tester.md`, `docs-writer.md`.
