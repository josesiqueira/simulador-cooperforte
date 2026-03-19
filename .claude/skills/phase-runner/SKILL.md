---
name: phase-runner
description: >
  Orchestrator for multi-phase project implementation using parallel subagents.
  Use when building a project from a spec. Runs a loop: plan → code (3 agents) →
  test (3 agents) → fix → repeat for each phase. Invoke with /phase-runner.
---

# Phase Runner — Multi-Agent Orchestrator

You are an orchestrator. Your job is to build a project phase by phase using
the planner, coder, and tester subagents. Follow this loop precisely.

## Prerequisites

Before starting, verify:
1. A project spec exists (the user will provide the path — a .md file with requirements)
2. The `.claude/agents/` directory contains: `planner.md`, `coder.md`, `tester.md`
3. The project repo is initialized (or create it)

If anything is missing, tell the user and stop.

## The loop

```
FOR each phase in IMPLEMENTATION-PLAN.md:
    1. DEPLOY 3 coder agents (parallel) → implement the phase
    2. WAIT for all 3 to finish
    3. DEPLOY 3 tester agents (parallel) → audit everything
    4. WAIT for all 3 to finish
    5. READ audit reports
    6. IF any report says FIX REQUIRED:
         DEPLOY 3 coder agents → fix reported issues
         WAIT → re-run testers → repeat until PROCEED
    7. COMMIT the phase
    8. Tell the user: "Phase N complete. Moving to Phase N+1."
NEXT phase
```

## Step-by-step execution

### Step 0 — Plan

Invoke the planner subagent:

```
Use the planner agent to analyze COOPERFORTE-SIMULATOR-INSTRUCTIONS.md and create IMPLEMENTATION-PLAN.md
```

After the planner finishes, show the user the plan summary (phase names, count, dependencies)
and ask: **"Does this plan look good? Should I adjust anything before starting?"**

Wait for user approval. If they want changes, re-invoke the planner with their feedback.

### Step 1 — Implement a phase

Read IMPLEMENTATION-PLAN.md to identify the current phase and its parallel tasks.
Split the tasks across 3 coder agents. Each agent gets a non-overlapping subset:

```
Use the coder agent: Implement Phase [N], tasks [1-3] from IMPLEMENTATION-PLAN.md.
[Include relevant context: which files exist, dependencies installed, etc.]
```

```
Use the coder agent: Implement Phase [N], tasks [4-6] from IMPLEMENTATION-PLAN.md.
[Same context]
```

```
Use the coder agent: Implement Phase [N], tasks [7+] from IMPLEMENTATION-PLAN.md.
[Same context]
```

If the phase has fewer than 4 tasks, use fewer agents (minimum 1, maximum 3).
Assign tasks so agents don't edit the same files. If task overlap is unavoidable,
serialize those tasks in a single agent.

### Step 2 — Test the phase

After all coders finish, invoke 3 tester agents in parallel with different focus areas:

```
Use the tester agent: Audit Phase [N] from IMPLEMENTATION-PLAN.md.
Focus on: acceptance criteria and functional correctness.
```

```
Use the tester agent: Audit Phase [N] from IMPLEMENTATION-PLAN.md.
Focus on: edge cases, error handling, and input validation.
```

```
Use the tester agent: Audit Phase [N] from IMPLEMENTATION-PLAN.md.
Focus on: integration with previous phases, build verification, and code quality.
```

### Step 3 — Evaluate

Read all AUDIT-phase-N.md files. Consolidate findings:

- If ALL reports say PROCEED: move to Step 4.
- If ANY report says FIX REQUIRED: collect all bugs and failed criteria into a
  fix list, then go to Step 3b.

### Step 3b — Fix cycle

Invoke coder agents with the specific bugs to fix:

```
Use the coder agent: Fix the following issues in Phase [N]:
[paste bug descriptions from audit reports with file paths and suggested fixes]
```

After fixes, re-run testers (Step 2). Repeat until all reports say PROCEED.
Maximum 3 fix cycles per phase. If still failing after 3 cycles, stop and
ask the user for guidance.

### Step 4 — Commit and advance

```bash
git add -A
git commit -m "feat: complete phase N — [phase name]"
```

Report to the user:
- Phase name and what was built
- How many fix cycles were needed
- Any noted concerns from audit reports
- Confirmation that all acceptance criteria are met

Then proceed to the next phase (back to Step 1).

### Step 5 — Done

After all phases are complete:
1. Run a final full build/test
2. Summarize what was built (total files, total phases, total fix cycles)
3. Ask the user if they want to deploy

## Task splitting strategy

When dividing tasks among 3 coder agents, follow these rules:

1. **By file**: tasks that create different files go to different agents.
2. **By layer**: if the phase has frontend + backend + config, split by layer.
3. **Dependencies within phase**: if task B depends on task A, put both in the same agent.
4. **Shared utilities**: if multiple tasks need a shared helper, assign the helper
   to the first agent and tell the others to wait for it or assume its API.
5. **Never split a single file** across agents — one file = one agent.

## Handling conflicts

If two coder agents accidentally modified the same file:
1. Detect with `git diff` after both finish
2. Keep the version from the agent whose task "owns" that file per IMPLEMENTATION-PLAN.md
3. Re-apply the other agent's changes manually if needed

## Status tracking

Maintain a `STATUS.md` file in the project root:

```markdown
# Project Status
Last updated: [timestamp]

| Phase | Status | Fix cycles | Notes |
|-------|--------|------------|-------|
| 1     | ✅ DONE | 0          |       |
| 2     | 🔄 IN PROGRESS | 1   | fixing IOF calc |
| 3     | ⏳ PENDING |          |       |
```

Update this file after each phase completes and at the start of each fix cycle.
