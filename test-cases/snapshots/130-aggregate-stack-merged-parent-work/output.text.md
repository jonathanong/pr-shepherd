# vouchington/vouchington stack #2535 — actionable

Stack: #2535 · anchor PR #2547 · 6 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #2509: Hashtags bounds](https://github.com/vouchington/vouchington/pull/2509) — not shepherded · not mergeable (`closed`)
  - MERGED · position 1/6 · base `main`
- [PR #2534: Hostname flags NOT NULL](https://github.com/vouchington/vouchington/pull/2534) — not shepherded · not mergeable (`closed`)
  - MERGED · position 2/6 · base `main`
- [PR #2547: Hostname dispatcher](https://github.com/vouchington/vouchington/pull/2547) — not shepherded · not mergeable (`conflicting`) · owned
  - OPEN · position 3/6 · base `fix/2429-hostname-flags-not-null`
- [PR #2569: Bloom rebuilds and backfills](https://github.com/vouchington/vouchington/pull/2569) — not shepherded · not mergeable (`review-work`) · owned
  - OPEN · position 4/6 · base `fix/1855-crawl-hostnames-dispatcher` · 1 actionable
- [PR #2627: UUID media registry and paged async replay](https://github.com/vouchington/vouchington/pull/2627) — not shepherded · not mergeable (`review-work`) · owned
  - OPEN · position 5/6 · base `fix/1855-bloom-reconciliation` · 1 actionable
- [PR #2629: Image projection view and hydration budgets](https://github.com/vouchington/vouchington/pull/2629) — not shepherded · not mergeable (`review-work`) · owned
  - OPEN · position 6/6 · base `fix/2508-media-delivery-registry-ids` · 1 actionable

## Instructions

1. Start or delegate one-PR sessions only for rows marked `owned`. Leave every other author's layer untouched. Owned layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2547 --until-terminal` for PR #2547.
3. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2569 --until-terminal` for PR #2569.
4. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2627 --until-terminal` for PR #2627.
5. Run `pr-shepherd https://github.com/vouchington/vouchington/pull/2629 --until-terminal` for PR #2629.
6. After the selected one-PR sessions, rerun this same `--stack` selector.
