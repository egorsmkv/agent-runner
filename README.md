Made by Oleksii Bondarenko

```
Usage:
  yarn agent run --file <prd.md>
  yarn agent resume
  yarn agent plan-review

Commands:
  run       Start over from a Markdown PRD, regenerate the YAML plan, then execute scopes.
  resume    Continue the previous interrupted run from saved YAML/state.
  plan-review
            Reevaluate YAML plan coverage against the Markdown PRD.

Options:
  --once          Complete at most one scope.
  --verbose-json  Print raw Codex JSONL events.

Codex model:
  Fixed to gpt-5.4 with medium reasoning.

Execution:
  Source edits run in .agent/worktrees/<prd-slug> on branch agent/<prd-slug>.
```
