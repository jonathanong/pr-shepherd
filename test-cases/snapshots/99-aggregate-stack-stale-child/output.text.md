# owner/repo stack #37 — actionable

anchor PR #362 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #361: Verified foundation — shepherded · mergeable
  - OPEN · base `main`
- PR #362: Stale child — shepherded · not mergeable (`stale-ancestry`) · owned
  - OPEN · base `foundation`

## Stack ancestry

- PR #362 base `foundation` at `0222222222222222222222222222222222222222` differs from parent PR #361 head `foundation` at `0111111111111111111111111111111111111111`.

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/362 --until-terminal`.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
