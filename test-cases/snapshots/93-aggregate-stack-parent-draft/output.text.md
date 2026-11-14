# owner/repo stack #31 — actionable

anchor PR #302 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #301: Draft foundation — not mergeable (`draft`)
  - OPEN · draft · base `main`
- PR #302: Ready-looking child — shepherded · mergeable
  - OPEN · base `foundation`

## Instructions

1. Start or delegate concurrent one-PR sessions for these layers; every layer is yours.
2. Run `pr-shepherd https://github.com/owner/repo/pull/301 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/owner/repo/pull/302 --until-terminal`. Keep watching until every layer is terminal.
