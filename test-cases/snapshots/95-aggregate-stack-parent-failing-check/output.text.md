# owner/repo stack #33 — actionable

anchor PR #322 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #321: CI failure — not mergeable (`failing-checks`)
  - OPEN · base `main` · 1 failing
- PR #322: Verified child — shepherded · mergeable
  - OPEN · base `foundation`

## Instructions

1. Start one concurrent one-PR session per command below; none for layers without one.
2. Run `pr-shepherd https://github.com/owner/repo/pull/321 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack "owner/repo#33" --until-terminal`. Keep watching until every layer is terminal.
