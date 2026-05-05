Read this Markdown PRD and create a structured YAML execution plan for agent.

Return YAML only. Do not edit files.

The Markdown PRD is the source of truth for human progress. Use the previous YAML plan,
previous runner state, and git status only as recovery hints to avoid dropping interrupted
or uncommitted progress.

Required schema:

```yaml
version: 1
prdPath: '{{prdPath}}'
status: not_complete
activeScopeId: null
lastCompletedScopeId: null
finalAcceptanceStatus: not_complete
qualityGates:
  focused:
    - yarn types
  final:
    - yarn types
    - yarn lint
scopes:
  - id: scope-1
    title: Short scope title
    status: not_started
    acceptanceCriteria:
      - US-001 or a short criterion reference
    qualityGates:
      - yarn types
    dependsOn: []
    parallelGroup: batch-1
    ownedFiles:
      - src/example/**
    temporaryFollowUps: []
    progress: []
    repairAttempts: 0
lastRunAt: null
currentBlocker: null
```

Rules:

- Split the PRD into small scopes that one Codex session can complete.
- Add `dependsOn` for hard sequencing only. Leave it empty when a scope can run without waiting.
- Add `parallelGroup` to batch independent scopes that can run in parallel in separate worktrees.
- Add `ownedFiles` with concrete files, folders, or globs each scope is expected to edit.
- Prefer more parallel batches over one long sequence when scopes touch different domains or files.
- Do not put scopes in the same parallel group when they likely edit the same files, depend on the same unfinished API, or share acceptance criteria.
- Preserve acceptance-criteria references when the PRD has them.
- Quote string-array items that contain colons, brackets, braces, backticks, or
  other YAML syntax characters. For example, write `"US-003: Parse fields: title"`
  instead of `US-003: Parse fields: title`.
- Put focused quality gates on each scope. Use PRD quality gates if present.
- Use only these scope statuses: not_started, in_progress, needs_repair, blocked, complete.
- Use only these plan/final statuses: not_complete, blocked, complete.
- If the PRD says a scope or criterion is complete, reflect that in YAML.
- If git status or previous state suggests interrupted work, mark the relevant scope in_progress or needs_repair.

Previous YAML plan, if any:

```yaml
@@previousPlanYaml@@
```

Previous runner state, if any:

```json
{{previousStateJson}}
```

Current git status --short:

```text
{{gitStatus}}
```

Markdown PRD:

{{markdown}}
