# owner/repo stack #39 — actionable

anchor PR #382 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #381: Verified foundation — shepherded · mergeable
  - OPEN · base `main`
- PR #382: Unverified child — mergeable, no READY receipt yet
  - OPEN · base `foundation`

## Instructions

1. Start one concurrent one-PR session per command below; none for layers without one. Run each command as its own session: one multi-PR `pr-shepherd <PR> <PR>` poll records no READY receipts.
2. Run `pr-shepherd https://github.com/owner/repo/pull/382 --until-terminal`. It looks ready, but only its own one-PR session records the READY receipt a stack merge needs.
3. After the selected one-PR sessions, rerun `pr-shepherd stack "owner/repo#39" --until-terminal`. Keep watching until every layer is terminal.
