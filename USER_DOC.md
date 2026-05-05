# Agent Runner Developer Guide

This repository contains the repo-local `yarn agent` CLI. It turns a Markdown
PRD into a YAML execution plan, runs Codex against scoped work items in external
agent-owned git worktrees, verifies the resulting diff, runs quality gates,
syncs completed checklist items back to the PRD, and creates local commits.

The runner is intended for local developer use. It never pushes changes.

## Requirements

- Node.js with Yarn available.
- Git repository checkout with a clean enough parent worktree for scope commits
  to be cherry-picked back after they pass.
- Codex CLI available on `PATH`.
- Project dependencies installed with `yarn install`.

## Common Commands

```sh
yarn agent run --file path/to/prd.md
```

Start a new run from a Markdown PRD. This regenerates the YAML plan under
`.agent/` and executes scopes until the PRD is complete or blocked.

```sh
yarn agent run --file path/to/prd.md --once
```

Run at most one scope, then exit. This is useful while testing PRD shape,
quality gates, or runner behavior.

```sh
yarn agent resume
```

Continue the last saved run from `.agent/` state. Use this after an interrupt,
crash, or intentional `--once` stop.

```sh
yarn agent plan-review --file path/to/prd.md
```

Reevaluate the YAML plan against the Markdown PRD. Plan review may add missing
scopes, reopen stale scopes, clarify gates or acceptance criteria, and compact
stale progress notes. It must not edit source code.

```sh
yarn agent plan-review --file path/to/prd.md --dry-run
```

Run plan review and print the result, then restore the original YAML plan.

## Options

- `--file`, `-f`: Markdown PRD file to run or review.
- `--once`: Execute at most one scope.
- `--parallel <n>`: Run up to `n` independent scopes at the same time. Parallel
  execution uses per-scope worktrees in the external `.agent-worktrees/`
  directory.
- `--verbose-json`: Print raw Codex JSONL events.
- `--dry-run`: Supported by `plan-review`; restores the original plan after the
  review.

The implementation model is fixed to `gpt-5.4` with medium reasoning. Do not add
model, profile, or sandbox option plumbing unless that is an explicit product
requirement.

## Runtime Files

Runner-owned state files live under `.agent/`, which is gitignored:

- `.agent/*.yml` or `.agent/**/*.yml`: YAML execution plans and run state.
- `.agent/**/context/`: generated scope context bundles passed to Codex.
- `.agent/error.log`: appended top-level crash log.

Agent-owned source worktrees live outside the repo in a sibling
`.agent-worktrees/<repo-id>/` directory:

- `.agent-worktrees/<repo-id>/<prd-slug>`: implementation worktree for normal
  serial execution.
- `.agent-worktrees/<repo-id>/scopes/<prd-slug>/<scope-id>`: per-scope worktrees
  for parallel execution.

Keeping source worktrees outside the project prevents editors from showing a
full duplicate checkout under `.agent/`.

Markdown PRDs are human-facing input. After a YAML plan exists, the runner uses
the YAML state as the execution source of truth. Markdown checklist markers are
updated only after a scope passes its gates.

## Execution Flow

1. `run` reads the Markdown PRD and generates or replaces the YAML plan.
2. The runner selects the next ready scope from YAML.
3. It creates or reuses an external agent-owned git worktree and branch named
   `agent/<prd-slug>`.
4. A scope context bundle is generated so Codex can focus on the active scope
   without rereading the full PRD and plan on every pass.
5. Codex implements the scope in the worktree.
6. Scope review checks whether the current diff is related to the active scope
   and complete enough to verify.
7. Focused quality gates run in the worktree.
8. Completed checklist markers are synced back to the Markdown PRD.
9. The scope is committed locally in the agent worktree.
10. The runner cherry-picks the scope commit back into the parent checkout when
    the parent checkout has no uncommitted changes.
11. Plan review runs after completed scopes and before final acceptance.
12. Final quality gates run before the PRD is accepted.

If the runner crashes during `run` or `resume`, it appends `.agent/error.log` and
automatically attempts one `resume` when saved state exists.

## PRD Expectations

A useful PRD should include:

- A clear title.
- Scope-sized checklist items or acceptance criteria.
- Concrete quality gates, preferably shell commands such as `yarn test`.
- Enough implementation context for Codex to identify the right files.
- Explicit exclusions for work that should not be handled in the current run.

Avoid relying on arbitrary Markdown structure for execution behavior. The first
plan generation pass turns the PRD into YAML, and YAML owns execution after that.

## Working With Git

The runner may create local commits for completed scopes. It does not push.

Before starting a run, commit or stash unrelated local changes in the parent
checkout when possible. If the parent checkout is dirty, scope work can still be
committed inside the agent worktree, but applying it back to the parent checkout
may be blocked.

Avoid destructive git cleanup under the sibling `.agent-worktrees/` directory
while a run is active. Use `yarn agent resume` when continuing an interrupted
run.

## Developing The Runner

Use the existing module boundaries:

- `index.mjs` dispatches user-facing commands only.
- `commands/` parses and validates CLI arguments.
- `actions/` owns executable behavior.
- `templates/` stores substantial prompt text.
- `utils/` contains small pure helpers only.
- `tests/` contains focused Vitest coverage for actions and prompt rendering.

Keep command handlers thin. They should parse flags, validate inputs, and call
actions. Workflow orchestration belongs in actions.

Use the `yaml` package for YAML parsing and serialization. Do not hand-roll YAML
parsing or string mutation for plan files.

When changing runner behavior, add or update focused tests first for the affected
area:

```sh
yarn test
```

## Troubleshooting

- `No previous agent run found`: run `yarn agent run --file <prd.md>` first, or
  pass `--file` to `plan-review`.
- `PRD path must point to a Markdown file`: use a `.md` file.
- `Parent checkout has uncommitted changes`: commit or stash parent checkout
  changes, then run `yarn agent resume`.
- Quality gate failures: inspect the gate output in the terminal. The runner
  records failure summaries in YAML state and will retry repair within bounded
  limits.
- Repeated crash: inspect `.agent/error.log`, fix the underlying issue, then run
  `yarn agent resume`.
