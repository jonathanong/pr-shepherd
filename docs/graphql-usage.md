# GraphQL usage by command

[← README](../README.md) | [graphql.md](graphql.md) | [github-api.md](github-api.md)

What each command spends against GitHub's GraphQL point budget, per tick and per hour. For operators sizing polling and contributors changing queries. REST-transport costs are in [rest-usage.md](rest-usage.md); automatic fallback can move the rest of a process to REST ([transport selection](github-api.md#transport-selection)).

A user PAT has 5,000 points/hour. One-PR polling is a small slice of that; aggregate polls are larger. Pricing rules are in [graphql.md](graphql.md#how-github-prices-a-query). The figures below are `rateLimit.cost` for the static query shape; extra pages add their own cost, and `--verbose` `apiUsage.graphql.measuredQueryCost` is authoritative for a live response.

Per-tick request counts are asserted at the HTTP boundary by these tests; change them and this page together:

| Test                                                | Title                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/github/graphql-wait-tick-cost.test.mts`        | "spends one BatchPr request per wait tick, reused or not"                                  |
| `src/github/graphql-wait-detectors.test.mts`        | "charges nothing on an unchanged idle wait tick"                                           |
| `src/github/graphql-stack-tick-cost.test.mts`       | "reads a layer above the trunk in one BatchPr request, cold or reused"                     |
| `src/github/graphql-stack-handoff-cost.test.mts`    | "routes layers on one summary read plus check-run details; their first ticks read nothing" |
| `src/github/graphql-base-behind-tick-cost.test.mts` | "reads the base compare once per base tip and head"                                        |

## How a point is counted

Formula: [graphql.md](graphql.md#how-github-prices-a-query). Facts specific to Shepherd's queries:

| Query shape                                       | Cost                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary `BatchPr`                                | 1 point; measured `nodeCount` 2,871 (cap 500,000)                                                                                                             |
| `BatchPr` with READY-receipt sibling              | 1 point (about 125 requests): exact `PollSummaryPr` sibling (about 36) and only the first 50 batch contexts; a head past 50 reads the rest with `BatchPrPage` |
| `contexts(last: 100) { annotations(first: 1) }`   | 100 connection-requests per rollup, even when empty; the summary fragment does not select it                                                                  |
| Summary review thread                             | One `comments(first: 5)` window under `reviewThreads(last: 20)`: about 36 connection-requests per PR                                                          |
| Author `{ login }`, query-root `viewer { login }` | Objects, not connections; under 1 point at 10 PRs                                                                                                             |
| Mutations                                         | Cannot select `rateLimit.cost`; counted as `unmeasuredRequestCount`. Secondary limits bill a mutation at 5 points, separate from the hourly budget            |

A summary thread with more than five comments is incomplete and differs from its full-transcript seen marker, so it counts as actionable unless a classification rule suppresses it; the rule sees the real root.

## Measured query costs

`rateLimit(dryRun: true)` costs for the current summary fragment. Hours use the default stack interval, 120s (30 ticks/hour).

| PRs | Summary | First stack tick | Points/hour |
| --- | ------- | ---------------- | ----------- |
| 1   | 1       | 1                | 30          |
| 5   | 2       | 2                | 60          |
| 10  | 4       | 3                | 120         |
| 20  | 7       | 7                | 210         |
| 50  | 18      | 18               | 540         |

"First stack tick" is an anchor's first tick. GitHub prices `entries(first: N)` for every slot, so the first summary page asks for 4 entries (the most that price at 1 point) and pages on for only the remaining entries. Each summary stores the stack size under the anchor, so later ticks size the page from it and cost the "Summary" column alone. A grown stack pages on for new entries; a shrunk one overpays once. Readiness never depends on the stored size: `readStack` validates full membership.

- A second summary page otherwise exists only past 50 layers. `Resource limits for this query exceeded` halves the page down to one entry and rereads, so a wide check matrix can add pages.
- Check contexts stay on the shared fragment, and `PollSummaryCheckPage` completes a window past 100 at 1 point without repeating the annotation probe.
- `fetchRawSummaryPr` uses the same fragment: 1 point.
- `PollSummaryAnnotationProbe` runs only for a layer that otherwise looks ready, one commit at a time, so a late annotation still changes the READY-receipt fingerprint ([`fingerprintRawSummaryPr`](../src/github/poll-summary-fingerprint.mts)). A commit past 100 contexts adds a page. It is not in the totals above; its cost is measured in `--verbose`. A failed or incomplete probe does not replace a stored fingerprint.

## Usage by command

Costs assume the PR number was passed; inferring it from the branch adds 1 point (`PrNumberByBranch`). MCP `iterate`, `apply`, and `build_suggestion_patches` use the same paths as the CLI.

### One PR

| Command                                                                  | What runs                                 | Typical points      |
| ------------------------------------------------------------------------ | ----------------------------------------- | ------------------- |
| `pr-shepherd [PR]` / `poll`, idle continuation tick, detectors unchanged | Conditional REST detectors only (all 304) | 0                   |
| `pr-shepherd [PR]` / `poll`, continuation tick, fingerprint hit          | `BatchPr` first page only                 | 1                   |
| Same tick, fingerprint miss                                              | `BatchPr`                                 | 1, plus supplements |
| Tick returned to the caller, last bounded tick, FIX_CODE debounce        | `BatchPr` (fingerprint reuse is off)      | 1, plus supplements |
| `iterate`, MCP `iterate` for one PR                                      | `BatchPr` every call                      | 1, plus supplements |
| First tick of a stack layer the stack tick routed, within 2 minutes      | The stack tick's handoff, no request      | 0, plus supplements |

`BatchPr`'s first page is the fingerprint read, so a hit and a miss cost the same 1 point when there are no supplements: about 60 points/hour at the default 60s interval. A thread among the newest 20 with more than one comment disables reuse.

An idle wait (no check running, for example a pending bot review after CI finished) first makes eight conditional REST reads ([graphql.md](graphql.md#idle-wait-change-detectors)). If all answer 304 within `poll.reconcileSeconds` (default 900) of the last GraphQL snapshot, the tick spends no points and no core requests; a changed read costs that read plus the ordinary tick, and the first idle tick seeds eight charged core reads. An hour of unchanged idle waiting costs about 4 points (one reconcile per 15 minutes) instead of 60.

Supplements on a full snapshot, usually 1 point each:

| Supplement                               | When                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BatchPrPage`                            | One combined request per extra round of threads, comments, reviews, or checks                                                                                                                                                                                                                                                                           |
| `ReviewThreadComments`                   | Per extra page of a thread's nested comments, concurrency 4                                                                                                                                                                                                                                                                                             |
| `CommitCheckContexts`                    | PR is queued, or its latest removal still matches HEAD                                                                                                                                                                                                                                                                                                  |
| `CheckRunAnnotationsBatch`               | Per 20 uncached completed checks whose probe saw more than one annotation (a single annotation comes free from the probe); 1-hour cache; further pages use `CheckRunAnnotations`                                                                                                                                                                        |
| `PollStackTopology`                      | Non-root layer of a stack past 50 entries, including fingerprint hits; one per 50 entries. Smaller stacks: topology rides on `BatchPr` (`stack.entries(first: 50)` link fields plus `trunkEntry: entries(first: 1)`, 3 connection-requests)                                                                                                             |
| `RefRules`                               | Stack layer whose bottom entry's base is not the trunk, so `BatchPr` lacked the trunk's rules                                                                                                                                                                                                                                                           |
| `BaseBehind`                             | Head with unreported required checks. Cached under the live base tip (`baseRef.target.oid`) and head, plus the trunk compare for a stack layer cached under the trunk tip and bottom layer head; reruns only when one moves                                                                                                                             |
| `UpperLayerConflictTarget`               | Conflicting upper stack layer                                                                                                                                                                                                                                                                                                                           |
| `CheckBlockerPull` / `CheckBlockerIssue` | Per distinct blocker while a matching check fails                                                                                                                                                                                                                                                                                                       |
| READY-receipt evidence                   | An existing receipt or elapsed ready-delay marker: `BatchPr` selects the `PollSummaryPr` sibling and copies complete annotation totals. A resource-limited document, or a field error confined to the sibling, retries plain `BatchPr`. Incomplete or mismatched evidence, or a review mutation after the batch, uses `fetchRawSummaryPr` and its probe |

On a measured ready PR (#481), the receipt evidence took one request and 2 points, versus three requests and 3 points as separate reads. Wider PRs can differ.

`BulkApply` runs when iterate minimizes or resolves in-process: unmeasured mutations in chunks of 10.

### Several PRs

`pr-shepherd --stack PR`, `pr-shepherd` with two or more PRs, and MCP aggregate `iterate` read the summary, not per-layer `BatchPr`. An explicit multi-PR selection uses `PollSummary` in chunks of 50. Each stack tick is:

- One `PollStackSummary` at the "Summary" cost above (4 entries on the anchor's first tick, then the rest).
- `PollSummaryAnnotationProbe` only for layers that otherwise look ready.
- `StackHandoffCheckRuns` only on a tick that routes owned layers to their one-PR sessions: one `nodes(ids:)` read per 100 check runs on those layers, 1 point each (measured), adding the check-run titles, summaries, and first annotations the summary lacks.

The summary also selects the scalar and object fields `BatchPr`'s first page needs (viewer capabilities, head repository, review and comment timestamps, thread capabilities and lines, check-suite workflow runs, base tip), none a connection. On a routing tick, each routed layer whose summary covers every `BatchPr` first-page window gets that page stored as a handoff:

| Handoff rule                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- |
| Read once only; the read deletes it                                                                                   |
| Valid within 2 minutes of the summary, for the same head only                                                         |
| Every later stack tick clears the handoff of each layer it does not hand off again                                    |
| A wider, queued, or queue-removed layer gets none; every later tick, including the FIX_CODE debounce, reads `BatchPr` |
| The REST transport has no handoff                                                                                     |

In the `stack-work` scenario (four routed layers), the summary, the handoff read, and the layers' first ticks total 3 points instead of 6. Later one-PR session ticks are separate spend.

READY-receipt fingerprints leave the handoff fields out, so a bot editing a hidden comment does not invalidate a receipt. The exception is thread comments' `isMinimized`, which the fingerprint uses to hide minimized bodies, as for comments and reviews. After upgrading to this fragment, stored READY receipts for PRs with review threads change fingerprint once.

### Mutations and one-shot reads

| Command                                     | What runs                                                                                                          | Typical points                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `apply review` / `resolve`, with reply IDs  | `ReplyThreadTranscripts` per 20 requested IDs, plus pages only for long transcripts, then `BulkApply` chunks of 10 | 1 or more for the read; mutations unmeasured |
| `apply review` / `resolve`, without replies | `BulkApply` only, plus up to 10 × `GetPrHeadSha` when `--require-sha` is set                                       | unmeasured, plus 1 per SHA poll              |
| `apply files` / `mark-files-as-viewed`      | `files(first: 100)` per page, then `markFileAsViewed` chunks of 10                                                 | 1 per file page; mutations unmeasured        |
| `apply journal` / `journal`                 | `GetPrBody`, then `UpdatePrBody` when the body changes and this is not `--dry-run`                                 | 1, plus an unmeasured mutation               |
| MCP `get_journal`                           | `GetPrBody` once, then local extraction                                                                            | 1                                            |
| MCP `extract_journal`                       | local extraction from the supplied body                                                                            | 0                                            |
| `apply check-blocker`                       | none when the PR number is passed                                                                                  | 0                                            |
| `build-suggestion-patches`                  | `SuggestionThreads`                                                                                                | 1 for a handful of threads                   |

- For 1 to 20 GraphQL reply thread IDs, one `ApplyReviewPreflight` read replaces the first `ReplyThreadTranscripts`, `GetPrHeadSha`, and `ReplyRecoveryEvidence` reads (3 read points down to 1); standalone reads still run for anything it cannot verify.
- [`runResolveMutate`](../src/commands/resolve-mutate.mts) reads only requested reply thread IDs (`nodes(ids:)`) to store seen-marker transcripts; GitHub still authorizes the mutation. Incomplete or mismatched threads get no marker, but their mutations still run.
- `clean`, `admin clean`, `log-file`, `admin log-file`, and `journal extract` do not call GitHub.

## Recommendations

One-PR `BatchPr` is at the 1-point floor; fewer review connections, a smaller annotation probe, or fewer thread comments on it do not reduce primary quota.

Not done: a whole-stack fingerprint that skips the summary. Check rollups, mergeability, queue entries, and annotation receipts change without bumping any layer's `updatedAt`, so a safe stack fingerprint would need most of the summary.

Designs already at the floor that should stay:

- Sizing `entries(first:)` to the stack instead of billing 50 empty slots.
- Slim `BatchPrPage` follow-ups with combined cursors instead of another full snapshot.
- Annotation bodies in chunks of 20 (21 connection-requests, 1 point), cached for 1 hour.
- Merge-queue check rollups only when the queue commit is current.
- Quota-band sleep on the poll dispatcher.
- Quota warnings and cadence following the active transport: after a switch to REST, prior GraphQL usage stays in telemetry but does not throttle the REST poll, and pending REST core warnings stay active.
- REST for job logs, startup-failure runs, and mergeability (a separate pool).
- Mutation chunks of 10. Primary `cost` is unavailable; secondary limits bill each mutation request at 5 points.
