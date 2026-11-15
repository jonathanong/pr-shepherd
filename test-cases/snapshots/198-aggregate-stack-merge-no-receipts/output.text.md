# owner/repo stack #98 — actionable

anchor PR #981 · 3 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #981: Layer 1 — mergeable, no READY receipt yet
  - OPEN · base `main`
- PR #982: Layer 2 — mergeable, no READY receipt yet
  - OPEN · base `layer-1`
- PR #983: Layer 3 — mergeable, no READY receipt yet
  - OPEN · base `layer-2`

## Instructions

1. Start one concurrent one-PR session per command below; none for layers without one. Run each command as its own session: one multi-PR `pr-shepherd <PR> <PR>` poll records no READY receipts.
2. Run `pr-shepherd https://github.com/owner/repo/pull/981 --until-terminal`. It looks ready, but only its own one-PR session records the READY receipt a stack merge needs.
3. Run `pr-shepherd https://github.com/owner/repo/pull/982 --until-terminal`. It looks ready, but only its own one-PR session records the READY receipt a stack merge needs.
4. Run `pr-shepherd https://github.com/owner/repo/pull/983 --until-terminal`. It looks ready, but only its own one-PR session records the READY receipt a stack merge needs.
5. After the selected one-PR sessions, rerun `pr-shepherd stack "owner/repo#98" --until-terminal --merge`. Keep watching until every layer is terminal.
