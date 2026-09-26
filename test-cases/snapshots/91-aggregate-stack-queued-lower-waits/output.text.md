# owner/repo stack #12 — timeout

Stack: #12 · anchor PR #202 · 2 layers · mode `summary`
stackMergeable: true
nextAction: wait

## Layers

- [PR #201: Base layer queued](https://github.com/owner/repo/pull/201) — shepherded · mergeable
  - OPEN · in merge queue · position 1/2 · base `main`
- [PR #202: Ready upper layer](https://github.com/owner/repo/pull/202) — shepherded · mergeable
  - OPEN · position 2/2 · base `feature-base`

## Instructions

1. The stack is in the merge queue. Recheck at the configured polling cadence; finish only after every layer is merged, and route any ejected layer to its one-PR session.
