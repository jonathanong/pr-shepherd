# GraphQL usage by command

[← README](../README.md) | [graphql.md](graphql.md)

This page is **what each command spends** against GitHub's primary GraphQL point budget, and **which of that spend is worth reducing**. How data is fetched stays in [graphql.md](graphql.md).

A user PAT is **5,000 points / hour**. One-PR polling is a small slice of that. Aggregate polls are not.

`--verbose` prints command-scoped `apiUsage.graphql.measuredQueryCost`. That figure is authoritative for a live response. The numbers below are `rateLimit.cost` for the static query shape. Extra pages add their own cost.

## How a point is counted

[GitHub's formula](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api): add up the connection-requests in the query AST (nested `first`/`last` multiply by the parent connection size; assume every connection fills its limit), divide by 100, and round to the nearest integer. The minimum is 1.

`nodeCount` is the separate 500,000-node cap. A BatchPr-shaped query measured `nodeCount` 2,871 and `cost` 1.

`annotations(first: 1)` nested under `contexts(last: 100)` is 100 connection-requests per rollup. GitHub prices the `last`, including when the rollup is empty. Two of those trees are about 2 points per PR once several PRs share one query.

Mutations cannot select `rateLimit.cost`. Shepherd counts them as `unmeasuredRequestCount`. Secondary limits bill a GraphQL mutation at 5 points; that pool is separate from the hourly primary budget. See [graphql.md](graphql.md).

## Measured query costs

Measured with `rateLimit { cost }` against a public pull request. The summary figures use the same connections as [`poll-summary-fragment.gql`](../src/github/gql/poll-summary-fragment.gql). Aliases and `stack.entries(first: N)` returned the same cost.

| Query shape                                                                                                                    | PRs | Measured cost |
| ------------------------------------------------------------------------------------------------------------------------------ | --- | ------------- |
| `PrFingerprint`                                                                                                                | 1   | 1             |
| `BatchPr` (annotation probe, `reviewThreads(last: 20) { comments(first: 100) }`, five review connections, rules, check suites) | 1   | 1             |
| Poll summary                                                                                                                   | 1   | 3             |
| Poll summary                                                                                                                   | 5   | 13            |
| Poll summary                                                                                                                   | 10  | 25            |

Larger summaries follow the same curve, about `round(252 × N / 100)` points. 20 PRs is about 50 points. 50 PRs, the chunk size, is about 126 points. A check page beyond the first 100 contexts is another query and another point, and that page includes the annotation probe again.

On a summary that kept the thread, comment, review, and check connections, removing both annotation probes cut a 10-PR query from 25 points to 5 and a 20-PR query from 49 to 9. Removing only the merge-queue rollup cut the 10-PR query from 25 to 15. The production fragment also selects a handful of 1-request connections (timeline events, review requests, latest reviews). At 10 PRs those add less than 1 point. The probes exist so a READY receipt fingerprint changes when a check gains an annotation. Summary routing does not read them.

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
- `fetchRawSummaryPr` — 3 points when writing or revalidating a READY receipt. This is a second snapshot on top of `BatchPr`.

`BulkApply` runs when iterate minimizes or resolves in-process. Mutations are unmeasured, in chunks of 10.

### Several PRs

`pr-shepherd --stack PR` and `pr-shepherd` with two or more PRs, including MCP aggregate `iterate`, read the summary. They do not run per-layer `BatchPr`. Each tick is:

- `PollStackTopology` (1 point) when the selection is a native stack.
- One poll-summary query of about 3 points per PR, chunked at 50.

The default interval is 120s (`poll.intervalSeconds` × `poll.stackIntervalFactor`), so 30 ticks/hour:

| PRs | Points per tick | Points per hour |
| --- | --------------- | --------------- |
| 10  | 25              | 750             |
| 20  | 50              | 1,500           |
| 50  | 126             | 3,780           |

The 10-PR row is measured. The 20- and 50-PR rows use the formula that matched the 1-, 5-, and 10-PR measurements. Extra check pages add 1 point per page per commit. The one-PR sessions the summary hands off to are separate spend.

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

One-PR `BatchPr` is already at the 1-point floor. Fewer review connections, a smaller annotation probe, or fewer thread comments on that query do not reduce primary quota. The aggregate summary is the spend that competes with the rest of the hour.

1. **Stop nesting annotation probes under both summary rollups.** `contexts(last: 100) { annotations(first: 1) }` is selected on the head commit and on `mergeQueueEntry` for every PR in the summary, including PRs that are not queued. The probe exists so [`fingerprintRawSummaryPr`](../src/github/poll-summary-fingerprint.mts) changes when a check gains an annotation. [`summarizePollSummaryChecks`](../src/github/poll-summary-checks.mts) does not read it. Refreshing annotation counts only for a layer that is otherwise ready, or dropping the queue rollup from the always-on query, is the difference between about 750 and about 150 points/hour for a 10-PR stack at the default interval. The 150 figure is the measured 5-point query at 30 ticks; the production fragment's other connections add less than 1 point at that size.

2. **Read reply threads by id in `apply review`.** [`runResolveMutate`](../src/commands/resolve-mutate.mts) loads a full batch, with approved-review pagination, to remember the pre-reply transcript. `nodes(ids:)` for the supplied thread ids avoids CI, annotation probes, and that pagination. The point win is small when the batch stays on one page. The payload win is the reason.

3. **Reuse the `BatchPr` snapshot for READY receipts.** `recordReadyReceipt` and `revalidateReadyReceipt` in [`src/commands/iterate/index.mts`](../src/commands/iterate/index.mts) call `fetchRawSummaryPr`, a 3-point summary, after `BatchPr` already loaded the PR. Folding the receipt fingerprint into that snapshot removes the second query on those ticks.

4. **Leave fingerprint-skip widening for later.** A multi-comment thread forces `BatchPr` on every continuation tick ([`tryReuseFingerprintReport`](../src/commands/check-fingerprint.mts)). Two points a minute is about 120 points/hour. Widen the skip only if summary spend is already down and that remainder still matters. The skip exists so an in-place edit is not hidden.

These are follow-ups. This page does not change the queries.

Designs that are already at the floor and should stay:

- Slim `BatchPrPage` follow-ups with combined cursors, instead of another full snapshot.
- Annotation bodies in chunks of 20, cached for 1 hour. A chunk is 21 connection-requests, which prices as 1 point.
- Merge-queue check rollups loaded only when the queue commit is current.
- Quota-band sleep on the poll dispatcher.
- REST for job logs, startup-failure runs, and mergeability. That pool is separate.
- Mutation chunks of 10. Primary `cost` is unavailable; secondary limits bill each mutation request at 5 points.
