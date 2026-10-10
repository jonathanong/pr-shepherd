# owner/repo stack #12 — timeout

anchor PR #202 · 2 layers · mode `summary`
stackMergeable: true
nextAction: wait

## Layers

- [PR #201: Base layer queued](https://github.com/owner/repo/pull/201) — shepherded · mergeable
  - OPEN · in merge queue · position 1/2 · base `main`
- [PR #202: Ready upper layer](https://github.com/owner/repo/pull/202) — shepherded · mergeable
  - OPEN · position 2/2 · base `feature-base`

## Instructions

1. The queued layers are waiting on the merge queue. Recheck them at the configured polling cadence. Do not rewrite a queued layer. This wait does not block work on a layer that is not in the queue. Route any ejected layer to its one-PR session.
