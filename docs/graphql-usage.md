# GraphQL usage by command

[← README](../README.md) | [graphql.md](graphql.md)

This page is **what each command spends** against GitHub's primary GraphQL point budget. How data is fetched stays in [graphql.md](graphql.md).

A user PAT is **5,000 points / hour**. One-PR polling is a small slice of that. Aggregate polls are not.

`--verbose` prints command-scoped `apiUsage.graphql.measuredQueryCost`. That figure is authoritative for a live response. The numbers below are `rateLimit.cost` for the static query shape. Extra pages add their own cost.

## How a point is counted

[GitHub's formula](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api): add up the connection-requests in the query AST (nested `first`/`last` multiply by the parent connection size; assume every connection fills its limit), divide by 100, and round to the nearest integer. The minimum is 1.

`nodeCount` is the separate 500,000-node cap. A BatchPr-shaped query measured `nodeCount` 2,871 and `cost` 1.

`annotations(first: 1)` nested under `contexts(last: 100)` is 100 connection-requests per rollup. GitHub prices the `last`, including when the rollup is empty. Two of those trees were about 2 points per PR once several PRs shared one query. The summary fragment no longer selects them.

Mutations cannot select `rateLimit.cost`. Shepherd counts them as `unmeasuredRequestCount`. Secondary limits bill a GraphQL mutation at 5 points; that pool is separate from the hourly primary budget. See [graphql.md](graphql.md).

## Measured query costs

The "before" column is the poll-summary shape measured for [the usage write-up](https://github.com/jonathanong/pr-shepherd/pull/466), including both annotation probes. 1, 5, and 10 PRs were measured; 20 and 50 used `round(252 × N / 100)` (about 50 and 126). The "after" column drops both probes. That drop was measured at 10 PRs (25 → 5) and 20 PRs (49 → 9, shown as 50 → 9 against the published before figure). 1, 5, and 50 use `round(52 × N / 100)` with a minimum of 1: each removed probe is 100 connection-requests. Author `{ login }` and the query-root `viewer { login }` are objects, not connections, and add less than 1 point at 10 PRs.

| PRs | Summary before | Summary after | Stack tick before | Stack tick after | Points/hour before | Points/hour after |
| --- | -------------- | ------------- | ----------------- | ---------------- | ------------------ | ----------------- |
| 1   | 3              | 1             | 4                 | 2                | 120                | 60                |
| 5   | 13             | 3             | 14                | 4                | 420                | 120               |
| 10  | 25             | 5             | 26                | 6                | 780                | 180               |
| 20  | 50             | 9             | 51                | 10               | 1,530              | 300               |
| 50  | 126            | 26            | 127               | 27               | 3,810              | 810               |

A stack tick is the summary plus the 1-point `PollStackTopology` preflight. The preflight stays: GitHub prices `entries(first: N)`, so asking for 50 slots on a 2-PR stack would bill the empty slots. The second summary page exists only past 50 layers. A `Resource limits for this query exceeded` response halves that page down to one entry and rereads, so a wide check matrix can add summary pages beyond the table. Check contexts stay on the shared fragment: one layer is the same shape as an explicit summary, and `PollSummaryCheckPage` still completes a window past 100. Hours use the default stack interval, 120s, which is 30 ticks/hour.

`fetchRawSummaryPr` uses the same fragment: 3 points before, 1 after. A check page past the first 100 contexts stays 1 point and no longer repeats the annotation probe.

`PollSummaryAnnotationProbe` runs only for a layer that otherwise looks ready, one commit at a time, so a late annotation still changes the READY-receipt fingerprint. It is not part of the always-on totals above.

## Usage by command

Costs below assume the PR number was passed. Omitting it adds 1 point for `PrNumberByBranch` on any command that infers the current branch. MCP `iterate`, `apply`, and `build_suggestion_patches` use the same paths as the CLI.

### One PR

| Command                                                           | What runs                            | Typical points      |
| ----------------------------------------------------------------- | ------------------------------------ | ------------------- |
| `pr-shepherd [PR]` / `poll`, continuation tick, fingerprint hit   | `PrFingerprint`                      | 1                   |
| Same tick, fingerprint miss                                       | `PrFingerprint` + `BatchPr`          | 2, plus supplements |
| Tick returned to the caller, last bounded tick, FIX_CODE debounce | `BatchPr` (fingerprint reuse is off) | 1, plus supplements |
| `iterate`, MCP `iterate` for one PR                               | `BatchPr` every call                 | 1, plus supplements |

At the default 60s interval, a fingerprint hit is about 60 points/hour and a miss is about 120. Both are a small share of 5,000. A thread among the newest 20 with more than one comment disables the skip, so many reviewed PRs pay the miss cost. That is still cheap.

Supplements on a full snapshot, usually 1 point each:

- `BatchPrPage` — one combined request per extra round of threads, comments, reviews, or checks.
- `ReviewThreadComments` — one request per extra page of a thread whose nested comments continue. Concurrency is 4.
- `CommitCheckContexts` — when the PR is in the merge queue, or the latest removal still matches HEAD.
- `CheckRunAnnotationsBatch` — one request per 20 uncached completed checks whose probe saw an annotation. Cached for 1 hour per check-run id. Further pages use `CheckRunAnnotations`.
- `PollStackTopology` — every iterate tick of a non-root native-stack layer, including fingerprint hits. One request per 50 entries.
- `UpperLayerConflictTarget` — a conflicting upper native-stack layer.
- `CheckBlockerPull` or `CheckBlockerIssue` — one request per distinct blocker while a matching check is failing.
- `fetchRawSummaryPr` — 1 point when writing or revalidating a READY receipt, and an annotation probe only when that snapshot otherwise looks ready. This is a second snapshot on top of `BatchPr`.

`BulkApply` runs when iterate minimizes or resolves in-process. Mutations are unmeasured, in chunks of 10.

### Several PRs

`pr-shepherd --stack PR` and `pr-shepherd` with two or more PRs, including MCP aggregate `iterate`, read the summary. They do not run per-layer `BatchPr`. Each stack tick is:

- `PollStackTopology` (1 point).
- One `PollStackSummary` query at the after column above, paged only past 50 layers.
- `PollSummaryAnnotationProbe` only for layers that otherwise look ready.

An explicit multi-PR selection skips the topology query and uses `PollSummary` in chunks of 50. The one-PR sessions the summary hands off to are separate spend.

### Mutations and one-shot reads

| Command                                                                     | What runs                                                                                | Typical points                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| `apply review` / `resolve`, with reply IDs                                  | Full `fetchPrBatch`, including approved-review pagination, then `BulkApply` chunks of 10 | 1 or more for the read; mutations unmeasured |
| `apply review` / `resolve`, without replies                                 | `BulkApply` only, plus up to 10 × `GetPrHeadSha` when `--require-sha` is set             | unmeasured, plus 1 per SHA poll              |
| `apply files` / `mark-files-as-viewed`                                      | `files(first: 100)` per page, then `markFileAsViewed` chunks of 10                       | 1 per file page; mutations unmeasured        |
| `apply journal` / `journal`                                                 | `GetPrBody`, then `UpdatePrBody` when the body changes and this is not `--dry-run`       | 1, plus an unmeasured mutation               |
| `apply check-blocker`                                                       | none when the PR number is passed                                                        | 0                                            |
| `build-suggestion-patches` / `build-suggestion-patch` / `commit-suggestion` | `SuggestionThreads`                                                                      | 1 for a handful of threads                   |

`clean`, `admin clean`, `log-file`, `admin log-file`, and `journal extract` do not call GitHub.

The reply path's `fetchPrBatch` exists to store a seen-marker transcript. GitHub still authorizes the mutation. On a one-page PR that read is 1 point. A long thread history adds page queries and pulls CI with it.

## Recommendations

One-PR `BatchPr` and `PrFingerprint` stay at the 1-point floor. Fewer review connections, a smaller annotation probe, or fewer thread comments on `BatchPr` do not reduce primary quota.

1. **Done: summary annotation probes are no longer always-on.** Both `contexts(last: 100) { annotations(first: 1) }` trees (head commit and `mergeQueueEntry`) are gone from the summary fragment. A layer that otherwise looks ready loads annotation totals with `PollSummaryAnnotationProbe`, so [`fingerprintRawSummaryPr`](../src/github/poll-summary-fingerprint.mts) still changes when a check gains an annotation. The before/after table above is that change. Removing only the queue rollup would have left a 10-PR summary at 15 points (about 450 points/hour). Removing both brings it to 5 (about 180 points/hour for the stack tick at 30 ticks).

2. **Read reply threads by id in `apply review`.** [`runResolveMutate`](../src/commands/resolve-mutate.mts) loads a full batch, with approved-review pagination, to remember the pre-reply transcript. `nodes(ids:)` for the supplied thread ids avoids CI, annotation probes, and that pagination. The point win is small when the batch stays on one page. The payload win is the reason. Not in this change.

3. **Reuse the `BatchPr` snapshot for READY receipts.** `recordReadyReceipt` and `revalidateReadyReceipt` in [`src/commands/iterate/index.mts`](../src/commands/iterate/index.mts) still call `fetchRawSummaryPr` after `BatchPr`. That second snapshot is now 1 point instead of 3. Folding the receipt fingerprint into `BatchPr` would remove it. Not in this change.

4. **Leave fingerprint-skip widening for later.** A multi-comment thread forces `BatchPr` on every continuation tick ([`tryReuseFingerprintReport`](../src/commands/check-fingerprint.mts)). Two points a minute is about 120 points/hour. Not in this change.

Designs that are already at the floor and should stay:

- The 1-point `PollStackTopology` preflight, so `entries(first:)` matches the stack instead of billing 50 empty slots.
- Slim `BatchPrPage` follow-ups with combined cursors, instead of another full snapshot.
- Annotation bodies in chunks of 20, cached for 1 hour. A chunk is 21 connection-requests, which prices as 1 point.
- Merge-queue check rollups loaded only when the queue commit is current.
- Quota-band sleep on the poll dispatcher.
- REST for job logs, startup-failure runs, and mergeability. That pool is separate.
- Mutation chunks of 10. Primary `cost` is unavailable; secondary limits bill each mutation request at 5 points.
