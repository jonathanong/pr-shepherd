# owner/repo stack #36 — timeout

anchor PR #352 · 2 layers · mode `summary`
stackMergeable: true
nextAction: wait

## Layers

- PR #351: Queued foundation — shepherded · mergeable
  - OPEN · in merge queue · base `main`
- PR #352: Queued child — shepherded · mergeable
  - OPEN · in merge queue · base `foundation`

## Instructions

1. The queued layers are waiting on the merge queue. Recheck them at the configured polling cadence. Do not rewrite a queued layer. This wait does not block work on a layer that is not in the queue. Route any ejected layer to its one-PR session.
