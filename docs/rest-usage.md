# REST usage by command

[← README](../README.md) | [rest.md](rest.md) | [github-api.md](github-api.md)

What each command spends against GitHub's REST `core` pool on the REST transport (`--transport rest`, `github.transport: rest`, or `auto` in a Claude Code cloud session or after a GraphQL fallback). For operators sizing polling and contributors changing REST reads. GraphQL points are in [graphql-usage.md](graphql-usage.md); REST calls made in GraphQL mode are in [graphql.md](graphql.md#rest-calls-in-graphql-mode).

`core` is metered in requests per hour (5,000 for a typical user token). Every snapshot `GET` whose route returns an ETag is conditional ([conditional reads](rest.md#conditional-reads)): a `304` is free, so "sent" is an upper bound and "charged" counts reads whose resource changed. A cloud session's `GET /pulls/{n}/ccr/review_threads` sends no ETag, so it goes out fresh every tick, but the proxy answers without `X-RateLimit-*` headers and it is not metered ([proxy routes](rest.md#claude-code-proxy-routes-and-unsupported-operations)). `--verbose` prints `apiUsage.rest.<resource>.requestCount` (charged), `notModified` (304s), and `apiUsage.unmeteredRestRequestCount`; those are authoritative for a live run.

## Where the numbers come from

These tests assert the counts at the HTTP boundary with fake servers that answer like GitHub's conditional reads, so a request is charged exactly when it is not a 304. Change a test and this page together.

| Test                                                    | Title                                                                                       | Asserts                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/github/rest-wait-tick-cost.test.mts`               | "charges the cold snapshot once and nothing on unchanged wait ticks"                        | One-PR tick: 14 reads, 13 charged cold (closing pull re-read is a 304); unchanged continuation and returned ticks: 0 of 14                 |
| `src/github/rest-wait-tick-cost.test.mts`               | "charges only the validator-less cloud thread read on unchanged cloud wait ticks"           | Cloud unchanged tick: only `ccr/review_threads` sent fresh, unmetered                                                                      |
| `src/github/rest-wait-tick-cost.test.mts`               | "does not replay the report when only the base branch moved"                                | Base-push lower bound: only `GET /branches/{base}` charged                                                                                 |
| `src/github/rest-proxy-tick-cost.test.mts`              | "re-reads the snapshot when the pull recomputes mergeability after a base push"             | Realistic cloud base push (live #566): 31 sent, 5 metered, 2 unmetered                                                                     |
| `src/github/rest-proxy-tick-cost.test.mts`              | "charges the full snapshot once after the proxy's real token rotates"                       | Proxy token rotation: unchanged tick charges 13, next tick 0                                                                               |
| `src/github/rest-wait-tick-cost.test.mts`               | "charges only the changed check read on the tick where CI settles"                          | CI settles: only check runs; the READY mergeability read is a 304                                                                          |
| `src/github/rest-wait-tick-cost.test.mts`               | "sends nothing past the snapshot when a settled draft escalates mark-ready"                 | Standard REST mark-ready escalates `transport-unsupported` with no request past the snapshot and the 304 refresh                           |
| `src/github/rest-terminal-batch.test.mts`               | "answers a merged PR from the first pull read"                                              | Merged PR: one pull read                                                                                                                   |
| `src/github/rest-stack-layer-tick-cost.test.mts`        | "charges nothing on an unchanged second upper-layer tick"                                   | Layer 2 of 2: 25 reads, 18 charged cold (16 once the lower layer merged); unchanged: 0 of 25                                               |
| `src/github/rest-stack-layer-tick-cost.test.mts`        | "charges only the validator-less CCR thread read on an unchanged cloud layer tick"          | Cloud, same stack: only `ccr/review_threads` sent fresh, unmetered                                                                         |
| `src/github/rest-changed-tick-cost.test.mts`            | "charges the pull, the base branch and the merged-base lookup when a base push conflicts"   | Conflict after base push: 3 charged                                                                                                        |
| `src/github/rest-changed-tick-cost.test.mts`            | "charges nothing on a READY tick after an unchanged READY tick"                             | Ready-delay countdown tick: 0 charged (cloud: plus the unmetered thread read)                                                              |
| `src/commands/apply-merge-warm-cost.test.mts`           | "charges only the merge write after a warm READY tick"                                      | Printing tick charges 0; `apply merge` sends 3, charges 1 (the `PUT`), direct and queued                                                   |
| `src/github/graphql-ready-refresh-cost.test.mts`        | "charges the first READY refresh and replays an unchanged pull for free"                    | GraphQL mode: first READY mergeability read charged; later READY tick on an unchanged pull is a 304                                        |
| `src/github/rest-wait-tick-cost.test.mts`               | "charges nothing on an unchanged 10-layer stack summary tick"                               | 10-layer stack: 104 charged cold, 0 unchanged, 1 when one shared resource changes                                                          |
| `src/github/rest-stack-summary-sharing.test.mts`        | "keeps complete 10-layer snapshots within the HTTP request budget"                          | 10 layers without validators: 126 requests; cloud adds 10 unmetered thread reads                                                           |
| `src/commands/iterate/check-blocker-gate.rest.test.mts` | "reads raw issue/pull state, deduplicates shared blockers and releases merged dependencies" | One `GET` per distinct check blocker                                                                                                       |
| `src/commands/iterate/mark-ready.rest.test.mts`         | "attempts cloud ready-for-review with unknown capability and trusts draft:false"            | Cloud mark-ready: one `ccr/ready_for_review` POST                                                                                          |
| `src/commands/iterate/mark-ready.rest.test.mts`         | "counts the headerless ready_for_review POST as unmetered, leaving core unchanged"          | That POST adds 1 to `unmeteredRestRequestCount`, 0 to `core`                                                                               |
| `src/comments/resolve.rest.test.mts`                    | "uses persisted opaque node identities and forwards replies, CCR resolution and dismissals" | Reply, CCR resolve, and dismissal each send one write (prior reads not asserted)                                                           |
| `src/comments/resolve.rest.test.mts`                    | "counts the headerless CCR resolve POST as unmetered, leaving core unchanged"               | `ccr/comments/{id}/resolve` adds 1 to `unmeteredRestRequestCount`, 0 to `core`                                                             |
| `src/commands/iterate/rest-bot-comment-edit.test.mts`   | "keeps the ready delay running and shows the edit once when it elapses"                     | Edited bot comment on a READY cloud PR keeps the countdown; shown once at the elapsed cancel ([rest.md](rest.md#bot-status-comment-edits)) |
| `src/github/api-telemetry-proxy-samples.test.mts`       | "keeps the later reset window when one tick's responses alternate between two windows"      | Two `core` windows in one tick: the later reset window is reported                                                                         |

The token bench models the same counts for whole sessions (`evals/tokens/lib.mjs`: `SHEPHERD_TICK_API_REST`, `SHEPHERD_TICK_API_CLOUD`, `stackTickApiRest`, `stackTickApiCloud`). A live cross-check in `evals/tokens/data/api-usage-check.json` (#548): 16 charged on a cold first tick (13 snapshot reads and 3 annotation reads) plus one free 304 pull re-read, then 0 charged with 14 not-modified reads on the unchanged second tick. Rows marked _modeled_ come from the bench, not a boundary test.

## One PR

The 14 reads ([snapshot coverage](rest.md#snapshot-coverage)) assume one page per list and a base summary reporting `protection.enabled: false`. Each extra list page adds one read; a protected base adds `GET /branches/{base}/protection`; a list whose last page holds exactly 100 items is re-read without a validator every tick, adding one charged read even when unchanged.

| Tick                                                                   | Requests sent | Charged                                                                                                                     |
| ---------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Cold cache (first tick in a state directory)                           | 14            | 13 (the closing pull re-read is a 304)                                                                                      |
| `pr-shepherd [PR]`, unchanged continuation tick                        | 14            | 0; the stored report is reused                                                                                              |
| Tick returned to the caller, `iterate`, MCP `iterate`, nothing changed | 14            | 0; the report is rebuilt from 304 bodies                                                                                    |
| Base branch moved, only the branch summary changed (lower bound)       | 14            | 1 (`GET /branches/{base}`)                                                                                                  |
| Base branch moved, as observed in a cloud session                      | 31            | 5 metered, plus 2 unmetered `ccr/review_threads` reads                                                                      |
| Claude Code proxy rotated its real token, nothing changed              | 14            | 13, as a cold cache; the next unchanged tick is 0                                                                           |
| CI settles to a READY candidate                                        | 14 + 1        | 1 (check runs) when `mergeable_state` did not change; 2 when it did (the snapshot pull read is a 200 and the refresh a 304) |
| Merged PR (a closed, unmerged PR reads the full snapshot)              | 1             | 1 (the pull; cloud too)                                                                                                     |
| Base push makes the PR conflict                                        | 14 + 1        | 3 (the pull, `GET /branches/{base}`, and the merged-base lookup `GET /pulls?head=...`)                                      |
| READY tick after an unchanged READY tick (ready delay elapses)         | 14 + 1        | 0; the READY report is rebuilt from 304 bodies                                                                              |
| Changed tick, general case                                             | 14            | only the reads whose resource changed                                                                                       |
| Claude Code cloud session, any of the above except a merged PR         | +1            | +0; `ccr/review_threads` has no ETag but is unmetered                                                                       |

Unlike GraphQL, where every returned tick pays for `BatchPr`, a REST tick that rebuilds its report charges only changed reads.

- **Real base push (live run #566, READY, ready delay counting):** `GET /branches/{base}`, the repository (`pushed_at`), and the first pull read (`base.sha`) answered 200. Mergeability was still recomputing, so the closing pull re-read returned another revision and the snapshot retried once; the retry's first pull read was 200, and the rest, the closing re-read, and the READY mergeability read were 304s. Two 15-read cloud snapshots plus the mergeability read: 31 sent, 5 metered, 2 unmetered.
- **Proxy token rotation:** the proxy swaps the placeholder `GH_TOKEN` for a real token, and GitHub's ETags vary with it (`Vary: Authorization`). On rotation every stored ETag misses, so the next tick charges the full snapshot (13 in the test, 14 metered in run #566); the tick after is free. Shepherd cannot see the rotation, because its credential fingerprint uses the placeholder.

Supplements, one request each unless noted:

| Supplement        | Cost                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Annotations       | One read per uncached completed check run reporting annotations, plus one per page past 100 (_modeled_, `annotationBatchApi`)                                                                                                          |
| Failed job log    | The run's jobs list (more pages past 100 jobs) and the job log, as on GraphQL                                                                                                                                                          |
| Check blockers    | One `GET /issues/{n}` or `GET /pulls/{n}` per distinct blocker while a matching check fails                                                                                                                                            |
| READY candidate   | One conditional mergeability `GET /pulls/{n}` sharing the pull's ETag: a free 304 unless the pull changed since the snapshot                                                                                                           |
| Mark-ready        | Cloud: one `POST /pulls/{n}/ccr/ready_for_review`, answered `200` `{"draft":false}` with no rate-limit headers (unmetered, live #566). Standard REST has no route and escalates `transport-unsupported`                                |
| Rule auto-resolve | Cloud: one unmetered `POST /pulls/{n}/ccr/comments/{id}/resolve` per matched thread (`200` `{"comment_ids":[...],"resolved":true}`). Successful mutations do not read or update the PR body. Rule auto-minimize is unsupported on REST |

A non-root native-stack layer's one-PR tick also reads the stack, the trunk's branch summary, rules, and compare (plus `GET /branches/{trunk}/protection` when the trunk is protected), and the topology (stack list and stack read twice, each layer's pull, and the viewer):

| Layer tick                                        | Extra sent                             | Charged in all                                                                                                   |
| ------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Cold cache                                        | 9 + stack size (10 if trunk protected) | 16 + stack size (one more if trunk protected): only the stack read, trunk reads, and other layers' pulls are new |
| Retargeted onto the trunk after its parent merged | same                                   | 14 + stack size (trunk summary and rules are the base's, so 304)                                                 |
| Unchanged later tick                              | same                                   | 0 (cloud: only the unmetered thread read)                                                                        |

`routedLayerTickApi` in `evals/tokens/scenarios.mjs` models the cold cost.

## Several PRs

`pr-shepherd stack PR` and `pr-shepherd` with two or more PRs read the summary, not per-layer snapshots.

A `stack` summary shares evidence within one tick ([rest.md](rest.md#shared-stack-tick-evidence)): repository and viewer once, stack membership before and after the layers, and branch policy once per distinct target branch. Per layer: the pull three times; review comments, issue comments, and reviews once each; CI and branch-policy reads; and in cloud the unmetered `ccr/review_threads`.

| Tick                                        | Requests sent                    | Charged                                    |
| ------------------------------------------- | -------------------------------- | ------------------------------------------ |
| 10-layer stack, no validators               | 126 (136 in a cloud session)     | 126 (cloud reads are unmetered)            |
| 10-layer stack, cold cache                  | 126                              | 104 (repeat reads inside the tick are 304) |
| 10-layer stack, unchanged                   | 126                              | 0                                          |
| 10-layer stack, one shared resource changed | 126                              | 1                                          |
| N-layer stack, no validators (_modeled_)    | 6 + 12 × N (6 + 13 × N in cloud) | 6 + 12 × N                                 |
| N-layer stack, unchanged, cloud (_modeled_) | 6 + 13 × N                       | 0 (N unmetered `ccr/review_threads` reads) |

`6 + 12 × N` is the bench's linear fit to the 10-layer count, not a per-endpoint breakdown.

An explicit list (`pr-shepherd 12 34 56`) shares only the viewer; each PR reads its own repository settings, stack lookup, and branch policy. A tick sends about 1 + 13 × N requests for single-page lists and unprotected bases (plus one unmetered thread read per PR in cloud), and an unchanged tick charges 0 (_modeled_ from `src/github/rest-explicit-summary-read.mts`; no boundary test).

## Mutations and one-shot reads

| Command                         | What runs on REST                                                                                                                                                                                                                                   | Requests                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apply review`, `--require-sha` | Pull read until the head matches (`apply.sha-poll-*`, default 2s × 10)                                                                                                                                                                              | 1 per poll                                                                                    |
| `apply review`, with reply IDs  | Transcript read (review comments, issue comments, reviews, viewer; plus `ccr/review_threads` in cloud), then per reply the viewer, review comments, and the reply POST. Extra pages add one read each (review-comment pages also add one per reply) | 4, plus 3 per reply, single-page baseline (_modeled_); cloud adds 1 unmetered read            |
| `apply review`, resolve IDs     | Cloud: `POST /pulls/{n}/ccr/comments/{id}/resolve`; unsupported on standard REST                                                                                                                                                                    | 1 unmetered write per thread, plus any read to locate the thread root                         |
| `apply review`, dismiss IDs     | `PUT /pulls/{n}/reviews/{id}/dismissals`                                                                                                                                                                                                            | 1 write per review, plus any read to map the review ID                                        |
| `apply review`, minimize IDs    | Unsupported; an error or one-look skip                                                                                                                                                                                                              | 0                                                                                             |
| `apply files`                   | Unsupported (`markFileAsViewed` has no REST route)                                                                                                                                                                                                  | 0                                                                                             |
| `apply journal`                 | Pull read, then `PATCH /pulls/{n}` when the body changes and this is not `--dry-run`                                                                                                                                                                | 1, plus 1 write                                                                               |
| `apply merge` (REST only)       | See below                                                                                                                                                                                                                                           | Unstacked: 3 sent; 1 charged after the printing tick, 3 on a cold cache; 2 sent when resuming |
| MCP `get_journal`               | Pull read                                                                                                                                                                                                                                           | 1                                                                                             |
| `suggest`                       | Pull read plus the feedback read                                                                                                                                                                                                                    | 1 + 4, single-page baseline (cloud adds 1 unmetered read); one more per extra page            |
| No PR number passed             | `GET /pulls?state=open`, paged, matched by head branch                                                                                                                                                                                              | 1 per 100 open PRs                                                                            |

`apply merge` reads the pull and `GET /stacks?pull_request=` membership, then sends one `PUT /pulls/{n}/merge-async`. Both reads are conditional in the PR's ETag cache, so after the printing tick they are 304s (`src/commands/apply-merge-warm-cost.test.mts`; cold: `src/commands/apply-merge-cost.test.mts`). Resuming a recorded request reads `GET /pulls/{n}/merge-async/{uuid}` instead of submitting. A native-stack layer also reads the stack and its topology twice, membership twice more, and one summary snapshot per open prefix layer before submitting.

`admin log-file`, `journal extract`, MCP `extract_journal`, and `admin clean` with an explicit PR number or the `repo` or `all` target do not call GitHub. `admin clean` with `pr` and no number, `branch`, or `current` resolve the PR with the paged `GET /pulls?state=open` scan, even with `--dry-run`.

Review-mutation rows are success-path costs:

- A reply POST with an ambiguous network or 5xx result re-reads the review comments to recover the reply.
- A reply, resolve, or dismissal denied with 403 or 404 triggers one full feedback read (4 requests plus extra pages; cloud adds the unmetered thread read), plus the thread-root lookup for a reply or resolve, so the item becomes a one-look skip.
