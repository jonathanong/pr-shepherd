# vouchington/vouchington stack #2535 — actionable

anchor PR #2547 · 6 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #2509: Hashtags bounds
  - MERGED · base `main`
- PR #2534: Hostname flags NOT NULL
  - MERGED · base `main`
- PR #2547: Hostname dispatcher — not mergeable (`conflicting`)
  - OPEN · base `fix/2429-hostname-flags-not-null`
- PR #2569: Bloom rebuilds and backfills — not mergeable (`review-work`)
  - OPEN · base `fix/1855-crawl-hostnames-dispatcher` · 1 actionable
- PR #2627: UUID media registry and paged async replay — not mergeable (`review-work`)
  - OPEN · base `fix/1855-bloom-reconciliation` · 1 actionable
- PR #2629: Image projection view and hydration budgets — not mergeable (`review-work`)
  - OPEN · base `fix/2508-media-delivery-registry-ids` · 1 actionable

## Instructions

1. Start one concurrent one-PR session per command below; none for layers without one.
2. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2547 --until-terminal`.
3. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2569 --until-terminal`.
4. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2627 --until-terminal`.
5. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2629 --until-terminal`.
6. After the selected one-PR sessions, rerun `pr-shepherd stack "vouchington/vouchington#2535" --until-terminal`. Keep watching until every layer is terminal.
