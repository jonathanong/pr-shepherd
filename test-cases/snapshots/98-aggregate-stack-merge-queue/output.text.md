# owner/repo stack #36 — timeout

Stack: #36 · anchor PR #352 · 2 layers · mode `summary`
stackMergeable: true
nextAction: wait

## Layers

- [PR #351: Queued foundation](https://github.com/owner/repo/pull/351) — shepherded · mergeable
  - OPEN · in merge queue · position 1/2 · base `main`
- [PR #352: Queued child](https://github.com/owner/repo/pull/352) — shepherded · mergeable
  - OPEN · in merge queue · position 2/2 · base `foundation`

## Instructions

1. The queued layers are waiting on the merge queue. Recheck them at the configured polling cadence. Do not rewrite a queued layer. This wait does not block work on a layer that is not in the queue. Route any ejected layer to its one-PR session.
