---
name: test-suite
description: >
  Testing orchestrator. Invoke with /test-suite to scan the codebase, create or
  update test cases, and run a full test pipeline: unit tests + component tests +
  Playwright E2E tests — all in parallel with 3 agents. Reports bugs and tracks
  coverage. Use whenever you need to test features, validate after implementation,
  or audit test coverage.
---

# Test Suite — Multi-Agent Testing Orchestrator

You are a test orchestrator. Your job is to ensure the codebase is thoroughly
tested using the test-planner, unit-tester, and e2e-tester subagents.

## Prerequisites

Verify these exist in `.claude/agents/`:
- `test-planner.md` — analyzes codebase, creates TEST-PLAN.md
- `unit-tester.md` — writes and runs unit/component tests (Vitest)
- `e2e-tester.md` — writes and runs Playwright E2E tests

If any are missing, tell the user and stop.

## The loop

```
1. DEPLOY test-planner → create/update TEST-PLAN.md
2. SHOW plan to user, ask for approval
3. COUNT test cases per layer (unit, component, e2e)
4. SPLIT test cases across agents:
      - 3 unit-tester agents (parallel) → unit + component tests
      - 1 e2e-tester agent → Playwright tests (can run parallel with unit agents)
5. WAIT for all 4 agents to finish
6. COLLECT all TEST-RESULTS-*.md files
7. CONSOLIDATE into TEST-REPORT.md
8. IF bugs found in application code:
      REPORT bugs to user
      ASK: "Should I invoke coder agents to fix these?"
9. IF test gaps found (features without tests):
      UPDATE TEST-PLAN.md
      RE-RUN missing tests
```

## Step-by-step execution

### Step 1 — Plan

```
Use the test-planner agent to analyze the codebase and create/update TEST-PLAN.md
```

After the planner finishes, show the user:
- Total test cases discovered
- Breakdown by layer (unit / component / e2e)
- Number of new tests vs existing tests
- Any features that have zero test coverage

Ask: **"Test plan ready. N test cases across 3 layers. Proceed?"**

### Step 2 — Split and dispatch

Read TEST-PLAN.md. Count test cases per layer.

**Unit + Component tests** — split across 3 unit-tester agents:

Divide UT-xxx and CT-xxx IDs into 3 roughly equal groups.
Try to keep tests for the same module in the same agent.

```
Use the unit-tester agent: Implement and run these test cases from TEST-PLAN.md:
UT-001 through UT-010, CT-001 through CT-003.
Test framework: Vitest. Write tests in tests/unit/ and tests/components/.
```

```
Use the unit-tester agent: Implement and run these test cases from TEST-PLAN.md:
UT-011 through UT-020, CT-004 through CT-006.
[same instructions]
```

```
Use the unit-tester agent: Implement and run these test cases from TEST-PLAN.md:
UT-021 through UT-030, CT-007 through CT-009.
[same instructions]
```

**E2E tests** — dispatch to 1 e2e-tester agent (Playwright needs a running server,
so parallelizing multiple Playwright instances is fragile — use 1 agent):

```
Use the e2e-tester agent: Implement and run ALL E2E test cases from TEST-PLAN.md.
Build and serve the app first. Base URL: http://localhost:4321.
Test on both desktop (1280x720) and mobile (375x667) viewports.
```

All 4 agents run in parallel. The e2e agent builds and serves the app independently.

### Step 3 — Collect results

After all agents finish, read:
- `TEST-RESULTS-unit.md` (from each unit-tester — may be 3 files)
- `TEST-RESULTS-e2e.md`

### Step 4 — Consolidate

Create `TEST-REPORT.md`:

```markdown
# Test Report
Date: [date]
Orchestrator: test-suite skill

## Summary
| Layer | Total | Passed | Failed | Skipped | Coverage |
|-------|-------|--------|--------|---------|----------|
| Unit  | N     | X      | Y      | Z       | [%]      |
| Component | N | X      | Y      | Z       | [%]      |
| E2E   | N     | X      | Y      | Z       | —        |
| **TOTAL** | **N** | **X** | **Y** | **Z** |         |

## Pass rate: X/N (XX.X%)

## Bugs found in application code
[consolidate all BUG-xxx from all TEST-RESULTS files]

| ID | Severity | File | Description | Found by |
|----|----------|------|-------------|----------|
| BUG-T001 | major | calculator.js:42 | IOF cap wrong | unit-tester |
| BUG-E001 | minor | styles.css | slider overflow mobile | e2e-tester |

## Failed tests
[list all failed test IDs with one-line descriptions]

## Test files created/modified
[list all test files]

## Recommendations
- [FIX REQUIRED if any critical/major bugs]
- [PROCEED if only minor issues]
- [coverage gaps to address in next run]
```

### Step 5 — Report to user

Show the user:
- Pass rate headline (e.g., "47/52 tests passed (90.4%)")
- Bug count by severity
- Recommendation (FIX REQUIRED or PROCEED)
- If there are bugs, ask if they want coder agents dispatched to fix

### Step 6 — Fix cycle (if needed)

If user approves fixes:

```
Use the coder agent: Fix the following bugs found by the test suite:
[paste all BUG-xxx entries with file paths, descriptions, and expected behavior]
After fixing, run: npx vitest run && npx playwright test
```

After coder finishes, re-run the failed tests only:

```
Use the unit-tester agent: Re-run only these previously failed tests:
[list of failed test IDs]
Verify the bugs are fixed.
```

```
Use the e2e-tester agent: Re-run only these previously failed E2E tests:
[list of failed E2E IDs]
```

Update TEST-REPORT.md with the fix cycle results.
Maximum 3 fix cycles. If still failing, escalate to user.

## When to invoke this skill

This skill should be used:
- **After every phase of phase-runner** (as the testing step)
- **On demand** when user says "test", "run tests", "check coverage", "audit"
- **Before deploy** as a final gate
- **After fixing bugs** to verify the fixes

## Integration with phase-runner

When invoked by phase-runner after a phase:
- The test-planner ONLY scans files from the current phase (read PLAN.md for file list)
- Tests from previous phases should already exist — just re-run them to check regressions
- Report back to phase-runner: PROCEED or FIX REQUIRED

## Handling flaky tests

If a test fails once but passes on retry:
- Mark as FLAKY in the report
- Don't count as a failure for the PROCEED/FIX decision
- Note it for investigation (but don't block the pipeline)
- Playwright has built-in retry (configured in playwright.config.js)
