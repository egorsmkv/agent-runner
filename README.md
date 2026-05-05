# Agent Runner

Made by Oleksii Bondarenko.

Agent Runner is a repo-local `yarn agent` CLI for executing Markdown PRDs with
Codex. It converts a human-readable PRD into YAML execution state, runs scoped
implementation passes in external agent-owned git worktrees, verifies the resulting diff,
runs quality gates, syncs completed checklist items back to Markdown, and creates
local commits.

The runner is designed for local development workflows. It never pushes changes.

## Quick Start

Install dependencies:

```sh
yarn install
```

Run the included example PRD:

```sh
yarn agent run --file docs/prds/example-feature.md --once
```

Continue a saved or interrupted run:

```sh
yarn agent resume
```

Run tests for the runner:

```sh
yarn test
```

## Example PRD

The repository includes an example PRD at
[`docs/prds/example-feature.md`](docs/prds/example-feature.md). It describes a
Node.js app with a React UI that renders news from public RSS feeds.

Use it as a starting point for new PRDs:

```sh
yarn agent run --file docs/prds/example-feature.md
```

A good PRD should include a clear title, scope-sized checklist items, concrete
acceptance criteria, quality gates, and explicit out-of-scope items.

## Commands

```sh
yarn agent run --file <prd.md>
```

Start over from a Markdown PRD, regenerate the YAML plan, then execute scopes.

```sh
yarn agent resume
```

Continue the previous interrupted or saved run from `.agent/` state.

```sh
yarn agent plan-review [--file <prd.md>]
```

Reevaluate YAML plan coverage against the Markdown PRD. Plan review may add
missing scopes, reopen stale scopes, clarify acceptance criteria, and compact
stale progress notes.

## Options

- `--file`, `-f`: Markdown PRD file to run or review.
- `--once`: Complete at most one scope.
- `--parallel <n>`: Run up to `n` independent scopes in separate worktrees.
- `--verbose-json`: Print raw Codex JSONL events.
- `--dry-run`: Supported by `plan-review`; restores the original plan after
  review.

## How It Works

1. `run` reads the Markdown PRD and generates YAML state under `.agent/`.
2. The runner selects the next ready scope from YAML.
3. Codex works in a sibling `.agent-worktrees/<repo-id>/...` checkout on branch
   `agent/<prd-slug>`.
4. Scope review checks whether the diff matches the active scope.
5. Focused quality gates run in the worktree.
6. Completed checklist markers are synced back to the Markdown PRD.
7. The scope is committed locally and cherry-picked back into the parent
   checkout when the parent checkout is clean.
8. Final plan review and final quality gates run before acceptance.

Runtime state and logs stay under `.agent/`, which is gitignored. Agent source
worktrees live outside the repo in a sibling `.agent-worktrees/` directory so
editors do not show a full duplicate checkout inside the project tree.

## Development Notes

- `index.mjs` is the user-facing command dispatcher.
- `commands/` parses and validates CLI arguments.
- `actions/` owns executable workflow behavior.
- `templates/` stores agent-facing prompts.
- `utils/` contains small pure helpers.
- `tests/` contains focused Vitest coverage.

The Codex implementation model is fixed to `gpt-5.4` with medium reasoning.
