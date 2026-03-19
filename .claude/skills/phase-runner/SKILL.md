---
name: phase-runner
description: >
  Orchestrator for multi-phase project implementation using parallel subagents.
  Use when building a project from a spec. Runs a loop per phase:
  code (3 agents) → audit (3 agents) → unit tests (3 agents) → e2e if UI (1 agent) → commit & push.
  Invoke with /phase-runner.
---

# Phase Runner — Multi-Agent Orchestrator

You are an orchestrator. Your job is to build a project phase by phase using
subagents for coding, auditing, and testing. Follow this loop precisely.

## Prerequisites

Before starting, verify:
1. A project spec exists (the user will provide the path — a .md file with requirements)
2. The `.claude/agents/` directory contains:
   - `planner.md`, `coder.md`, `tester.md` (implementation + audit)
   - `test-planner.md`, `unit-tester.md`, `e2e-tester.md` (testing pipeline)
3. The `.claude/skills/test-suite/` directory contains `SKILL.md`
4. The project repo is initialized with a remote (`git remote -v`)
5. Dependencies are installable (`npm install` or equivalent works)

If anything is missing, tell the user and stop.

## The loop — overview

```
STEP 0: PLANNER → create PLAN.md → user approves

FOR each phase in PLAN.md:

  STEP 1: IMPLEMENT
    └─ 3 coder agents (parallel) → write code

  STEP 2: AUDIT (cheap gate)
    └─ 3 tester agents (parallel) → check acceptance criteria
    └─ FAIL? → fix cycle → back to STEP 1
    └─ PASS? → continue ↓

  STEP 3: UNIT TESTS
    └─ test-planner → create/update TEST-PLAN.md for this phase
    └─ 3 unit-tester agents (parallel) → write + run unit/component tests
    └─ FAIL? → fix cycle → back to STEP 1
    └─ PASS? → continue ↓

  STEP 4: E2E TESTS (only if phase has UI)
    └─ 1 e2e-tester agent → Playwright (desktop + mobile)
    └─ FAIL? → fix cycle → back to STEP 1
    └─ PASS? → continue ↓

  STEP 5: COMMIT & PUSH
    └─ git add → commit → push
    └─ update STATUS.md
    └─ tell user → next phase

AFTER ALL PHASES:
  STEP 6: FULL REGRESSION
    └─ run ALL unit tests + ALL e2e tests
    └─ final report → ask user about deploy
```

## Step-by-step execution

### Step 0 — Plan

Invoke the planner subagent:

```
Use the planner agent to analyze [spec file path] and create PLAN.md
```

After the planner finishes, show the user the plan summary (phase names, count,
dependencies) and ask: **"Does this plan look good? Should I adjust anything
before starting?"**

Wait for user approval. If they want changes, re-invoke the planner with feedback.

Also classify each phase: **has UI** (files in `src/pages/`, `src/components/`,
or any `.astro`, `.jsx`, `.html`) vs **logic only** (`.js`, `.ts`, `.py`, config).
Store this in PLAN.md as a flag per phase. This determines whether Step 4 runs.

---

### Step 1 — Implement

Read PLAN.md to identify the current phase and its parallel tasks.
Split the tasks across 3 coder agents. Each agent gets a non-overlapping subset:

```
Use the coder agent: Implement Phase [N], tasks [1-3] from PLAN.md.
[Include relevant context: which files exist, dependencies installed, etc.]
```

```
Use the coder agent: Implement Phase [N], tasks [4-6] from PLAN.md.
[Same context]
```

```
Use the coder agent: Implement Phase [N], tasks [7+] from PLAN.md.
[Same context]
```

If the phase has fewer than 4 tasks, use fewer agents (minimum 1, maximum 3).
Assign tasks so agents don't edit the same files (see Task Splitting Strategy below).

---

### Step 2 — Audit (cheap gate)

This is a fast check against acceptance criteria. It catches broken code BEFORE
investing tokens in writing test files.

Invoke 3 tester agents in parallel with different focus areas:

```
Use the tester agent: Audit Phase [N] from PLAN.md.
Focus on: acceptance criteria and functional correctness.
```

```
Use the tester agent: Audit Phase [N] from PLAN.md.
Focus on: edge cases, error handling, and input validation.
```

```
Use the tester agent: Audit Phase [N] from PLAN.md.
Focus on: integration with previous phases, build verification, and code quality.
```

**Evaluate**: Read all AUDIT-phase-N.md files.
- ALL say PROCEED → continue to Step 3.
- ANY says FIX REQUIRED → go to Fix Cycle (see below).

---

### Step 3 — Unit tests

Now the code passes basic audit. Time to write proper tests.

**3a — Plan test cases:**

```
Use the test-planner agent: Analyze the files created/modified in Phase [N]
(see PLAN.md for the file list). Create or update TEST-PLAN.md with unit test
cases (UT-xxx) and component test cases (CT-xxx) for the new code.
Only add tests for THIS phase — don't re-plan tests for previous phases.
```

**3b — Run unit tests (3 agents parallel):**

Read TEST-PLAN.md. Split the new UT-xxx and CT-xxx IDs into 3 groups.

```
Use the unit-tester agent: Implement and run test cases [UT-001 to UT-010]
from TEST-PLAN.md. Framework: Vitest. Write to tests/unit/ and tests/components/.
```

```
Use the unit-tester agent: Implement and run test cases [UT-011 to UT-020]
from TEST-PLAN.md. [same instructions]
```

```
Use the unit-tester agent: Implement and run test cases [UT-021+]
from TEST-PLAN.md. [same instructions]
```

**3c — Also run ALL existing unit tests (regression):**

One of the 3 agents should also run:
```bash
npx vitest run 2>&1
```
to ensure previous tests still pass. Report any regressions.

**Evaluate**: Read TEST-RESULTS-unit.md files.
- ALL tests PASS → continue to Step 4.
- ANY test FAIL with bug in application code → Fix Cycle.
- Test itself is wrong (not the app) → agent should have fixed the test already.

---

### Step 4 — E2E tests (conditional)

**Skip this step** if the phase has NO UI files (check the `has_ui` flag in PLAN.md).

If the phase has UI:

**4a — Plan E2E test cases:**

```
Use the test-planner agent: Analyze the UI pages/components in Phase [N].
Add E2E test cases (E2E-xxx) to TEST-PLAN.md for the new user flows.
```

**4b — Run Playwright:**

```
Use the e2e-tester agent: Implement and run the E2E test cases added for Phase [N].
Also re-run ALL existing E2E tests to check for regressions.
Build the app first (npm run build && npm run preview).
Test desktop (1280x720) and mobile (375x667).
```

Only 1 e2e agent (Playwright needs a running server — parallelizing multiple
browser instances against the same server is fragile).

**Evaluate**: Read TEST-RESULTS-e2e.md.
- ALL PASS → continue to Step 5.
- FAIL → Fix Cycle.
- FLAKY (passed on retry) → note it, but continue (don't block).

---

### Step 5 — Commit & push

All tests pass. Ship it.

```bash
git add -A
git commit -m "feat(phase-N): [phase name]

- [1-line summary of what was built]
- Tests: X unit, Y component, Z e2e — all passing
- Audited by 3 tester agents, fix cycles: [N]"

git push origin main
```

Update `STATUS.md`:

```markdown
| N | ✅ DONE | [fix cycles] | [unit tests] unit, [e2e tests] e2e | [commit hash] |
```

Report to the user:
- Phase name and what was built
- Test summary (unit pass/total, e2e pass/total)
- Fix cycles needed
- Any concerns from audit or test reports
- Confirm push succeeded

Then proceed to the next phase (back to Step 1).

---

### Step 6 — Full regression (after all phases)

After the last phase is committed and pushed:

**6a — Run ALL unit tests:**
```bash
npx vitest run --reporter=verbose 2>&1
```

**6b — Run ALL E2E tests:**
```bash
npx playwright test --reporter=list 2>&1
```

**6c — Build verification:**
```bash
npm run build 2>&1
```

**6d — Final report:**

Create `FINAL-REPORT.md`:

```markdown
# Final Report
Date: [date]
Spec: [spec file]
Repository: [remote URL]
Total phases: N
Total fix cycles: N
Total commits: N

## Test coverage
| Layer | Tests | Passed | Failed |
|-------|-------|--------|--------|
| Unit  | N     | N      | 0      |
| Component | N | N      | 0      |
| E2E   | N     | N      | 0      |

## Phases completed
| Phase | Name | Fix cycles | Tests added | Commit |
|-------|------|------------|-------------|--------|
| 1     | ...  | 0          | 12 unit     | abc123 |
| 2     | ...  | 1          | 8 unit, 5 e2e | def456 |

## Build status: PASS/FAIL
## Ready for deploy: YES/NO
```

```bash
git add -A
git commit -m "docs: add final report and test coverage summary"
git push origin main
```

Ask the user: **"All phases complete. N unit tests, M e2e tests, all passing.
Ready to deploy?"**

---

## Fix cycle

When any step (audit, unit test, or e2e) reports FIX REQUIRED:

1. Collect ALL bugs from all reports into a single fix list.
2. Invoke coder agents with the bugs:

```
Use the coder agent: Fix the following issues in Phase [N]:
[paste bug descriptions with file paths, expected vs actual, suggested fixes]
After fixing, run: npx vitest run
```

3. After coders finish, re-run ONLY the step that failed:
   - If audit failed → re-run Step 2
   - If unit tests failed → re-run Step 3b (just the failing tests)
   - If e2e failed → re-run Step 4b (just the failing tests)

4. Maximum **3 fix cycles per step** within a phase.
   If still failing after 3 cycles, stop and ask the user for guidance.

5. Each fix cycle gets its own commit:
```bash
git add -A
git commit -m "fix(phase-N): [brief description of what was fixed]"
```
(Push happens in Step 5 after all steps pass, not during fix cycles.)

---

## Task splitting strategy

When dividing tasks among 3 coder agents:

1. **By file**: tasks that create different files go to different agents.
2. **By layer**: if the phase has frontend + backend + config, split by layer.
3. **Dependencies within phase**: if task B depends on task A, put both in the same agent.
4. **Shared utilities**: if multiple tasks need a shared helper, assign the helper
   to the first agent and tell the others to wait for it or assume its API.
5. **Never split a single file** across agents — one file = one agent.

## Handling conflicts

If two coder agents accidentally modified the same file:
1. Detect with `git diff` after both finish
2. Keep the version from the agent whose task "owns" that file per PLAN.md
3. Re-apply the other agent's changes manually if needed

## Detecting UI phases

A phase **has UI** if any of its files match:
- `src/pages/**`
- `src/components/**`
- Any file ending in `.astro`, `.jsx`, `.tsx`, `.svelte`, `.vue`
- Any `.html` file that is a page (not a template fragment)

Check this against the file list in PLAN.md. If uncertain, assume it has UI
(better to run an unnecessary E2E test than to miss a broken page).

## Status tracking

Maintain a `STATUS.md` file in the project root:

```markdown
# Project Status
Last updated: [timestamp]
Repository: [remote URL]

| Phase | Status | Fix cycles | Unit tests | E2E tests | Commit |
|-------|--------|------------|------------|-----------|--------|
| 1     | ✅ DONE | 0         | 12 pass    | —         | abc123 |
| 2     | ✅ DONE | 1         | 8 pass     | 5 pass    | def456 |
| 3     | 🔄 IN PROGRESS | 0  |            |           |        |
| 4     | ⏳ PENDING |         |            |           |        |
```

Update after each phase completion and at the start of each fix cycle.

## Git conventions

- **Branch**: work on `main` unless user specifies otherwise
- **Commit messages**: `feat(phase-N): description` for phases, `fix(phase-N): description` for fix cycles, `docs:` for reports
- **Push**: after every completed phase (Step 5) and after final report (Step 6)
- **Never force push** — if push fails, tell the user
- **Tag releases**: after Step 6, suggest `git tag v1.0.0 && git push --tags`
