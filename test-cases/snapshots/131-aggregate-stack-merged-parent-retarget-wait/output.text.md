# vouchington/vouchington stack #2535 — timeout

anchor PR #2547 · 6 layers · mode `summary`
stackMergeable: true
nextAction: wait

## Layers

- PR #2509: Hashtags bounds
  - MERGED · base `main`
- PR #2534: Hostname flags NOT NULL
  - MERGED · base `main`
- PR #2547: Hostname dispatcher — shepherded · mergeable
  - OPEN · base `fix/2429-hostname-flags-not-null`
- PR #2569: Bloom rebuilds and backfills — shepherded · mergeable
  - OPEN · base `fix/1855-crawl-hostnames-dispatcher`
- PR #2627: UUID media registry and paged async replay — shepherded · mergeable
  - OPEN · base `fix/1855-bloom-reconciliation`
- PR #2629: Image projection view and hydration budgets — shepherded · mergeable
  - OPEN · base `fix/2508-media-delivery-registry-ids`

## Instructions

1. PR #2547 still targets `fix/2429-hostname-flags-not-null` rather than `main`; wait for GitHub to retarget it before merging. Recheck at the configured polling cadence.
