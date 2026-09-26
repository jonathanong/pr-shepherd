# owner/repo stack #37 — actionable

Stack: #37 · anchor PR #362 · 2 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #361: Verified foundation](https://github.com/owner/repo/pull/361) — shepherded · mergeable
  - OPEN · position 1/2 · base `main`
- [PR #362: Stale child](https://github.com/owner/repo/pull/362) — shepherded · not mergeable (`stale-ancestry`) · owned
  - OPEN · position 2/2 · base `foundation`

## Stack ancestry

- PR #362 base `foundation` at `0222222222222222222222222222222222222222` differs from parent PR #361 head `foundation` at `0111111111111111111111111111111111111111`.

## Instructions

1. Start or delegate one-PR sessions only for rows marked `owned`. Leave every other author's layer untouched. Owned layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/362 --until-terminal` for PR #362.
3. After the selected one-PR sessions, rerun this same `--stack` selector.
