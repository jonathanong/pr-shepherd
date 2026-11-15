# vouchington/vouchington stack #2622 — timeout

anchor PR #2621 · 2 layers · mode `summary`
nextAction: wait

## Layers

- PR #2620: layer 1 — not mergeable (`review-work`)
  - OPEN · base `main` · 3 actionable
- PR #2621: layer 2 — shepherded · mergeable · owned
  - OPEN · base `layer-1`

## Instructions

1. Start one concurrent one-PR session per command below, only for `owned` rows; none for layers without one.
2. PR #2620 is not owned. Do not run a session for it.
3. No owned layer needs a session. The remaining work belongs to other authors. Recheck at the configured polling cadence; Shepherd escalates `stall-timeout` if the stack does not change.
