# owner/repo stack #32 — actionable

anchor PR #312 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #311: Conflicting foundation — not mergeable (`conflicting`)
  - OPEN · base `main`
- PR #312: Verified child — shepherded · mergeable
  - OPEN · base `foundation`

## Instructions

1. Start one concurrent one-PR session per command below; none for layers without one.
2. Run `pr-shepherd https://github.com/owner/repo/pull/311 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack "owner/repo#32" --until-terminal`. Keep watching until every layer is terminal.
