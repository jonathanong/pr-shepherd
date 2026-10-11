# shepherd GraphQL

[← README](../README.md) | [context.md](context.md)

This page describes GitHub transports, GraphQL operation cost, and how to keep a poll from exhausting API budgets. `github.transport` selects `auto` (default), `graphql`, or `rest`; the CLI `--transport` flag and library/MCP option select the same mode. In `auto`, `CLAUDE_CODE_REMOTE=true` starts with REST. Elsewhere Shepherd starts with GraphQL and switches to REST for the rest of the process only after the recognized Claude Code GraphQL 403, proven primary GraphQL exhaustion, or an outage after bounded retries. Credential errors, ordinary permission/query errors, and secondary limits do not trigger fallback. Proxy settings apply to both clients.

REST may not provide every field available through GraphQL; unavailable fields stay unknown, and transport-unsupported operations produce a surfaced skip, error, or escalation. Each selected transport's text, JSON, and MCP outputs still project equivalent available information. A clean merge state with complete CI and complete feedback evidence can establish READY even if REST cannot supply `reviewDecision` or branch-protection details. The missing `reviewDecision` alone never blocks READY, because neither transport uses it to derive readiness; a non-clean state still needs readable branch policy. A queued PR may use REST for supported queue interactions; queue enqueue is not presumed GraphQL-only. See [configuration](configuration.md#github-api-transport) and [escalations](escalations.md#transport-unsupported).

The observed Claude Code proxy contract includes `GET /pulls/{n}/ccr/review_threads`, `POST /pulls/{n}/ccr/comments/{comment_id}/resolve`, and `POST /pulls/{n}/ccr/ready_for_review`. These routes support thread reads, resolve, and mark-ready in REST mode. The corresponding unresolve, auto-merge, and convert-to-draft `ccr` routes have not had their request/response contracts verified, so Shepherd treats those operations as unsupported until they are recorded and implemented. REST also has no comment-minimize or file-view operation. Unsupported automatic cleanup is a surfaced one-look skip; an explicit requested operation returns a clear unsupported error or `transport-unsupported` handoff.

REST does not expose current merge-queue removal history. If a tick carries previously fetched removal evidence after switching to REST, Shepherd still surfaces the failed checks, but reports automatic same-head queue recovery and native-stack removal acknowledgment as `transport-unsupported` rather than printing commands that cannot revalidate the removal. Repeating an existing same-head merge request only resumes the old enqueue result. A definite old-head enqueue can still be replaced after a fresh read verifies a changed PR head.

Related: [graphql-usage.md](graphql-usage.md) (points per command), [authentication.md](authentication.md) (token pools), [configuration.md](configuration.md) (`watch.graphqlQuotaWarnings`), [debugging.md](debugging.md) (rate-limit exhaustion), [actions.md](actions.md) (quota-warning output).

## REST snapshot coverage

REST reads use the core API pool and paginate list endpoints with `per_page=100` and GitHub's `Link` header. A full snapshot repeats the core PR read at the end and retries once when the head, base, or revision changes during pagination. REST does not use the GraphQL first-page fingerprint, because the REST snapshot cannot provide all policy, capability, and queue inputs needed to validate a cached report; it reuses reports through conditional reads instead (below).

REST snapshot reads are conditional. Each `GET` sends `If-None-Match` with the ETag stored for that path under `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/rest-cache/` (removed by `admin clean`); a `304 Not Modified` replays the stored body, including its pagination `Link`, and consumes no primary quota. Because an item appended past a full page leaves that page's body and ETag unchanged, a 304 for a full page (100 items) with no `rel="next"` is immediately re-read without a validator so a new later page is never hidden. Pull reads whose mergeability GitHub is still computing (`mergeable: null` or `mergeable_state: unknown`) are never stored. Proxies and TLS verification behave as for any other REST request. `--verbose` reports 304s as `apiUsage.rest.<resource>.notModified` (text: `N not modified (304)`), omitted when 0; they are not counted in `requestCount` (text: `N requests`, likewise omitted when 0, as on an all-304 tick) and never affect rate-limit samples. When poll continuation ticks (the same internal opt-in as the GraphQL fingerprint skip) see every snapshot read return 304 with the same ETags the previous report was built from, the stored report (`rest-report.json` in the same PR state directory) is reused with no further read. No separate mergeability read is needed: mergeability moves only when the head or the base moves, the head is in the pull body, and the base branch summary (`GET /branches/{base}`, which carries the base `commit.sha`) is one of the conditional reads, so a base push answers 200. A pull body whose mergeability is still being computed is never stored, so it cannot answer 304. Config changes, a non-reusable cached action, or any 200 response rebuild the report. An unchanged REST wait tick therefore spends no core requests, and an unchanged native-stack or explicit-list summary tick (also conditional) spends none either.

The base branch summary also gates classic protection: when it reports `protection.enabled: false`, Shepherd skips `GET /branches/{base}/protection`, whose 404 answer could never be a free 304. When `/user` is denied (as for some installation tokens), the denial is remembered per credential for one hour so later ticks do not repeat a charged 4xx; the viewer stays unknown.

If the CCR thread list and inline-comment list disagree because feedback changed during the read, Shepherd re-reads the CCR threads and then the inline comments once. A persistent membership mismatch returns a retryable snapshot-changed error (`409`, exit `75`) instead of presenting incomplete feedback or treating the race as malformed data. Invalid payloads and duplicate memberships still fail as malformed data.

REST stack polling shares repository merge settings, stack membership, and repeated branch-policy reads within one tick. Each layer still reads complete CI and feedback and verifies its PR revision; final membership and member-ref checks reject a moving stack. Shared evidence is discarded before the next tick.

Current-branch PR discovery matches the head branch name across repository owners, including a fork's branch when `origin` points to the base repository. Journal reads retain the PR identity needed to complete a body update through REST if GraphQL quota runs out between the read and write.

REST returns raw check runs, workflow suites, review states, partial applicable branch rules, and native-stack membership where the endpoint supplies them. It does not currently report queue membership, enqueue state, or queue-removal history; queue metadata is retained only when a documented operation response supplies it. A generic 403/404 from classic branch-protection reads leaves protection unknown. An explicit 404 `Branch not protected` response proves classic protection absent; together with complete ruleset evidence it permits a known no-queue policy. A successful classic-protection read does not expose its queue requirement, so queue policy stays unknown unless an applicable ruleset positively requires a queue. Aggregate `reviewDecision` and viewer capabilities are unavailable. Native stacks use GitHub's `/stacks?pull_request=N` lookup followed by `/stacks/{number}`; an authoritative 404 is an error rather than evidence that the PR is a standalone branch. Generated REST stack merge commands bind the observed stack number, trunk, and ordered prefix with `--expected-stack`, so disappearing or changed membership cannot turn a stale stack command into a standalone merge. The observed Claude Code proxy routes and supported mutation gaps are listed above.

The REST PR's `auto_merge` request is retained when present, including its merge method and enabler. REST provides no enable timestamp, so that field remains omitted. A merge-enabled session waits on an existing request instead of issuing another merge operation.

REST inline feedback retains viewer authorship by matching each actual author to the authenticated `/user` login. A viewer-owned root keeps reply-and-resolve routing, including resolve-only retries after a marked reply. An unavailable viewer identity stays unknown; a viewer-authored reply never grants ownership of another person's root. When complete CCR thread status proves an older review's associated threads all resolved or outdated, REST marks the review stale using the same predicate as GraphQL. Unknown thread status or a review without associated threads cannot prove staleness.

Native stack summaries and topology reads also preserve an unavailable viewer identity as unknown, including with GitHub App installation tokens. An explicitly guarded stack merge still validates complete membership, ancestry, and current READY receipts; GitHub decides whether the requested mutation is authorized.

## GitHub metering

GitHub meters GraphQL in **points per hour**, not HTTP requests. A typical user PAT is **5,000 points / hour**. GitHub App installation tokens can be higher. REST `core` is a **separate** pool; exhausting GraphQL does not exhaust REST, and vice versa.

[GitHub's cost formula](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api):

1. Count the connection-requests implied by the query AST. Nested `first`/`last` multiply by the parent connection size. Assume every connection fills its limit.
2. Divide by 100 and round to the nearest integer. Minimum cost is 1.

Example: `reviewThreads(last: 20) { comments(first: 100) }` is 1 (threads from the PR) + 20 (comments from each thread on that page) = 21 connection-requests. Older threads use the slim page query. A `BatchPr`-shaped first page, including the check-run annotation probe, measures at **cost 1**. Per-command totals are in [graphql-usage.md](graphql-usage.md). `--verbose` `GraphQL measured cost` is authoritative; do not guess from this page.

Other limits that are not the hourly point budget:

| Limit                 | What it is                                                                                                        | How Shepherd sees it                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Node cap              | A single query may not request more than **500,000** potential nodes (`first`/`last` multiplied through the tree) | Query rejected; not a quota warning                                                                                            |
| Primary GraphQL quota | `x-ratelimit-remaining` / `rateLimit.remaining` on resource `graphql`                                             | `apiUsage.graphql`, `quotaWarning`, pagination abort at remaining 0                                                            |
| Secondary rate limit  | Burst / concurrency / mutation abuse. **Does not** decrement remaining                                            | HTTP 200 with GraphQL errors, or HTTP 403, often with `Retry-After` and a `secondary rate limit` message; `EXIT.TEMPFAIL` (75) |

Mutations cannot select `rateLimit { cost }` (that field lives on the Query root). Shepherd records them as `unmeasuredRequestCount` and still reads remaining/limit from response headers.

REST requests use GitHub's `core` budget and GraphQL requests use the separate `graphql` budget. `apiUsage` retains telemetry from both pools, including GraphQL attempts made before an automatic switch. Quota warnings and poll cadence follow the active transport: REST mode uses REST core only, while GraphQL mode considers GraphQL and REST core usage. A pending REST core warning remains active through the poll loop; stale GraphQL warnings are discarded after a switch. A transport switch is logged once in verbose output; it is not a signal that the original error was harmless or that the two snapshots have identical fields.

Queries select this sibling so cost is exact:

```graphql
_shepherdRateLimit: rateLimit {
  cost
  limit
  nodeCount
  remaining
  resetAt
  used
}
```

The alias is merged with `x-ratelimit-*` headers in `github/api-telemetry.mts`, so ordinary requests need no extra quota call. In `auto` mode, a recognized GraphQL quota refusal without a usable GraphQL quota sample triggers `GET /rate_limit`; only a measured empty GraphQL bucket authorizes fallback. A healthy, malformed, or unavailable probe preserves the original error. Secondary limits and forced `graphql` mode never trigger this probe.

## The batch query

**File:** [`src/github/gql/batch-pr.gql`](../src/github/gql/batch-pr.gql)

A single GraphQL query fetches everything shepherd needs per PR on the first page:

- PR state (`state`, `isDraft`, `mergeable`, `mergeStateStatus`, `reviewDecision`, `headRefOid`)
- Base-branch rules that apply to this PR (`baseRef.rules` from active repository/org rulesets, plus classic `branchProtectionRule`) — no extra round-trip
- Merge queue membership (`isInMergeQueue`, `isMergeQueueEnabled`, `mergeQueueEntry`) and GitHub stack membership (`stack`, `stackEntry`)
- Review threads (paginated backward, see below)
- PR comments (paginated backward)
- Reviews / changes-requested / commented / approved reviews (paginated backward)
- CI check runs (paginated forward, see below) and `checkSuites` (first 50, used for startup-failure detection). Each `CheckRun` includes an `annotations(first: 1)` probe with `totalCount` and the full annotation fields, so later annotation reads run only for checks with more than one annotation. The probe stays `first: 1`: the nested fields are objects, not connections, so they add no cost. It sets `hasAnnotations` and is part of the READY-receipt fingerprint. Bodies for runs with more than one annotation use a separate batched query (see the operation catalog).

`latestReviews` is capped at 100 and `reviewRequests` at 50; extra pages are not fetched. Copilot-in-progress detection can miss reviewers beyond those caps.

Merge-queue **check rollups** are not part of the always-on first page. The batch keeps queue metadata (`position`, `state`, head/removal commit OIDs and parents). When the PR is in the queue, or the latest removal is still current, [`src/github/merge-queue-checks.mts`](../src/github/merge-queue-checks.mts) loads that commit's `statusCheckRollup` via [`commit-check-contexts.gql`](../src/github/gql/commit-check-contexts.gql). Non-queued ticks do not pay two nested annotation-probe trees.

Startup-failure workflow runs and failed-job log excerpts are check-read supplements. GraphQL `statusCheckRollup` can omit workflow runs that fail before job/check contexts exist. The batch query reads `commit.checkSuites` and merges suites whose `conclusion` is `STARTUP_FAILURE` into the check list. REST `GET /actions/runs?status=startup_failure` runs only when that CheckSuite page is missing or truncated (`hasNextPage`). For ordinary failing Actions jobs, Shepherd also fetches a bounded raw log excerpt from the matched job after classification/triage.

## Response integrity

GraphQL reads are strict. A response with any GraphQL `errors`, null `data`, invalid JSON, a malformed payload, or a null check-context node throws a `GitHubRequestError`. Error messages retain GraphQL paths when GitHub supplies them. This prevents an incomplete PR, review, or CI snapshot from driving an iterate action; `iterate` and `poll` fail immediately and exit a `sysexits.h` code derived from the HTTP status (`77` for 401/403, `75` for 429/5xx/rate-limited, `69` otherwise — see [exit-codes.md](exit-codes.md)) instead of returning zero and reaching `10`–`14`.

Only mutation batches that can preserve independent per-alias successes opt in to partial data. The resolve mutation path reports successful aliases and returns failed aliases for retry. New read paths must not enable partial data.

## Pagination strategy

Shepherd uses cursor-based GraphQL pagination. Extra pages do **not** re-run `batch-pr.gql`. They use [`src/github/gql/batch-pr-page.gql`](../src/github/gql/batch-pr-page.gql), a slim document that `@include`s only the connections that still have a cursor. Outstanding cursors are sent together in one request per round so a PR that needs another page of threads _and_ checks pays one follow-up, not two full snapshots.

| Data type      | Direction                                     | Cursor field  | Why                                                                             |
| -------------- | --------------------------------------------- | ------------- | ------------------------------------------------------------------------------- |
| Review threads | **Backward** (`last: N, before: startCursor`) | `startCursor` | Want the most recent threads first; need to walk earlier pages for full history |
| PR comments    | **Backward**                                  | `startCursor` | Same rationale as threads                                                       |
| Reviews        | **Backward**                                  | `startCursor` | Same rationale                                                                  |
| CI check runs  | **Forward** (`first: N, after: endCursor`)    | `endCursor`   | Checks are added chronologically; newest are at the end                         |

Approved-review extra pages are opt-in (`paginateApprovedReviews`) so monitor ticks do not walk long approval histories.

If `x-ratelimit-remaining` is 0 before a follow-up page, pagination throws rather than returning a silently truncated thread list (every thread must be surfaced at least once). Nested thread-comment extra pages (`review-thread-comments.gql`) run with a concurrency cap of 4 and likewise stop when remaining is 0.

The generic paginator is in `github/pagination.mts`. It accepts a `direction` parameter and handles cursor tracking.

## Operation catalog

Static documents live in [`src/github/gql/`](../src/github/gql/) and are loaded from [`src/github/queries.mts`](../src/github/queries.mts). Dynamic mutation documents are built at runtime (they cannot be expressed as a single static file).

| Operation                    | Document                                      | When it runs                                                                                                                                                                                                                                               | Selects `rateLimit.cost` |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `BatchPr`                    | `batch-pr.gql`                                | Every `runCheck` / iterate tick. On a poll continuation tick its first page is also the fingerprint read; a hit stops there                                                                                                                                | yes                      |
| `BatchPr` with receipt alias | `batch-pr.gql` + `poll-summary-fragment.gql`  | Existing READY receipt or elapsed ready-delay hint; the exact `PollSummaryPr` sibling and batch annotation totals replace a separate receipt read when complete; the batch's first context page is 50 here so the document stays at 1 point                | yes                      |
| `PollSummary`                | dynamic aliases + `poll-summary-fragment.gql` | Explicit multi-PR summary, in chunks of 50                                                                                                                                                                                                                 | yes                      |
| `PollStackTopology`          | `poll-stack-topology.gql`                     | A non-root native-stack layer only when `BatchPr` could not carry the topology (more than 50 entries, or an incomplete entry), and before the first `PollStackSummary` of an anchor; link fields only                                                      | yes                      |
| `UpperLayerConflictTarget`   | `upper-layer-conflict-target.gql`             | A conflicting upper native-stack layer: whether its head already contains its base, and which open layer targets trunk                                                                                                                                     | yes                      |
| `PollStackSummary`           | `poll-stack-summary.gql`                      | `--stack` summary; entry pages sized to the stack (`first: min(size, 50)`), from the size the anchor's last summary stored. A later page asks only for the entries that remain. A resource-limit error halves `first` down to 1 and continues with `after` | yes                      |
| `PollSummaryAnnotationProbe` | `poll-summary-annotation-probe.gql`           | One commit, only when a summary layer otherwise looks ready, so a READY receipt still sees annotation totals                                                                                                                                               | yes                      |
| `PollSummaryCheckPage`       | `poll-summary-check-page.gql`                 | A summary PR's head or merge-queue commit with more than 100 status contexts, per older page; no annotation probe                                                                                                                                          | yes                      |
| `BatchPrPage`                | `batch-pr-page.gql`                           | Extra connection pages; combined cursors                                                                                                                                                                                                                   | yes                      |
| `ReviewThreadComments`       | `review-thread-comments.gql`                  | A thread whose nested `comments` connection has another page                                                                                                                                                                                               | yes                      |
| `CommitCheckContexts`        | `commit-check-contexts.gql`                   | Merge-queue (or current-removal) commit check rollup, including page 1                                                                                                                                                                                     | yes                      |
| `CheckRunAnnotationsBatch`   | `check-run-annotations-batch.gql`             | First annotation page for uncached completed checks whose probe saw more than one annotation, 20 check runs per request                                                                                                                                    | yes                      |
| `CheckRunAnnotations`        | `check-run-annotations.gql`                   | Further pages only when a batched first page has `hasNextPage` (1h derived cache per check-run id)                                                                                                                                                         | yes                      |
| `BaseBehind`                 | `base-behind.gql`                             | A head with unreported required checks, only when the live base tip or head commit differs from the cached compare. A native-stack layer compares the trunk against the bottom open layer, cached separately under the trunk tip                           | yes                      |
| `RefRules`                   | `ref-rules-query.gql`                         | A native-stack layer whose `BatchPr` page did not carry the trunk's rules (the bottom entry's base is not the trunk): trunk rules and the trunk compare in one read                                                                                        | yes                      |
| `SuggestionThreads`          | `suggestion-threads.gql`                      | `build-suggestion-patches`                                                                                                                                                                                                                                 | yes                      |
| `ApplyReviewPreflight`       | inline in `apply-review-preflight.mts`        | `apply review` with 1–20 GraphQL reply thread IDs: head, viewer, and reply threads in one read                                                                                                                                                             | yes                      |
| `GetPrHeadSha`               | `get-pr-head-sha.gql`                         | `--require-sha` poll (`resolve.shaPoll`, default 2s × 10)                                                                                                                                                                                                  | yes                      |
| `PrNumberByBranch`           | `pr-number-by-branch.gql`                     | No PR number passed (avoid this — pass the number)                                                                                                                                                                                                         | yes                      |
| `GetPrBody`                  | `get-pr-body.gql`                             | Journal apply before a body mutation, or read-only `get_journal`                                                                                                                                                                                           | yes                      |
| `UpdatePrBody`               | `update-pr-body.gql`                          | Journal apply                                                                                                                                                                                                                                              | no (mutation)            |
| `MarkPrReady`                | `mark-pr-ready.gql`                           | `mark_ready` when `viewerCanUpdate`                                                                                                                                                                                                                        | no (mutation)            |
| `PullRequestFiles`           | inline in `mark-files-as-viewed.mts`          | `apply files`                                                                                                                                                                                                                                              | yes                      |
| `CheckBlockerPull`           | inline in `iterate/check-blocker-gate.mts`    | One query per distinct pull blocker while a matching check is failing                                                                                                                                                                                      | yes                      |
| `CheckBlockerIssue`          | inline in `iterate/check-blocker-gate.mts`    | One query per distinct issue blocker while a matching check is failing                                                                                                                                                                                     | yes                      |
| `BulkApply`                  | runtime aliases in `comments/resolve.mts`     | reply / resolve / minimize / dismiss, chunks of 10                                                                                                                                                                                                         | no (mutation)            |
| `markFileAsViewed`           | runtime aliases, chunks of 10                 | `apply files`                                                                                                                                                                                                                                              | no (mutation)            |

### Check-run annotation bodies

`annotations(first: 1)` on `BatchPr`, `BatchPrPage`, and `CommitCheckContexts` selects `totalCount` and the full annotation fields. When `totalCount` is 1, that page is the whole body: Shepherd converts it directly and skips `CheckRunAnnotationsBatch` for the run. The extra fields are objects, so the probe's connection cost is unchanged. The always-on poll-summary fragment does not select annotations. On a one-PR READY-receipt candidate, Shepherd copies complete totals by check ID into the same-request compact summary, preserving the existing v1 fingerprint without a probe. `PollSummaryAnnotationProbe` still loads totals for other summary reads and for fallback receipt snapshots, paging with `before` past the newest 100 contexts. A failed or incomplete probe does not write a fingerprint and does not clear a receipt whose head and base still match. A check page past the first 100 contexts stays 1 point and does not repeat the probe.

Uncached completed checks with more than one annotation (passing, failing, skipped, filtered, and ignored) share `CheckRunAnnotationsBatch`. The document is one `nodes(ids:)` connection plus one nested `annotations(first: 100)` connection per id. GitHub counts those as connection-requests, divides by 100, and rounds to the nearest integer, with a minimum cost of 1. A chunk of 20 is 1 + 20 = 21 connection-requests, which prices as **1 point**. A larger chunk multiplies the nested connection and can cross the next point, so the chunk size exists to keep the calculated cost at 1. `--verbose` measured `cost` stays authoritative; do not treat 1 as a guess when the response reports something else.

Check runs whose first page sets `hasNextPage` continue with `CheckRunAnnotations` and a cursor, for that id only, up to the existing 1,000-annotation cap. Results are cached per check-run id for 1 hour. Cached runs are left out of the batch. A rate-limit error (the same classification as `--until-terminal` retry) aborts the remaining chunks and follow-up pages so the poll loop can back off. Other per-check failures are ignored and summarized once per tick.

The poll-summary documents include raw workflow/run identities so compact check counts use the same
ignored, protected-run, event, and superseded-run classifier as full iteration. They also include
review provenance, latest decisive review state, reviewer requests, and repository administration
capability for classification-rule, bot-review, thread-root, and draft blocking-review routing.

Status contexts are not capped: the summary reads the newest 100 per commit, and
`PollSummaryCheckPage` pages older ones by the commit's `oid` with the same node selection (the
shared `poll-summary-check-contexts.gql` fragment) until the list matches `totalCount`. Both summary
paths hydrate before anything fingerprints the PR and drop the page cursor, so a one-PR READY
receipt and an aggregate stack read hash the same evidence. A page that answers for another object,
loses its rollup, or leaves the count short keeps the checks incomplete, which fails readiness
closed. Bounded review connection overflow remains reported as incomplete context. For READY
certification, a `CLEAN` merge state plus a conversation-resolution requirement on the base branch
provides GitHub's confirmation that conversations no longer block merging, so a truncated review
sample alone does not prevent a receipt. Sampled actionable feedback and incomplete CI still
prevent certification. `BLOCKED` and `UNKNOWN` are not proof of resolved conversations; neither
is queue membership. Without the conversation-resolution requirement, review truncation alone
does not block certification when the applicable rule page is complete; a truncated rule page
cannot establish that resolution is optional. Truncated review evidence includes the PR's
`updatedAt` in its receipt fingerprint, so an update outside the sample invalidates the receipt
and sends the layer through a full one-PR review poll. Complete samples keep their existing
fingerprint behavior. The full one-PR check still fetches and surfaces review feedback independently
of this compact certification. A null status-check rollup is a valid empty check set.

## Per-tick budget

The built-in single-PR poll interval is **60s** (`poll.intervalSeconds`). `--stack` and multi-PR polls default to that interval times `poll.stackIntervalFactor` (built-in **2**, so **120s**) because each tick reads the stack summary, whose cost grows with the number of PRs. An explicit `--interval` overrides either default and is not multiplied again. Ready-delay is **10 minutes**. A one-PR `BatchPr` is 1 point, so repeating it every minute is a small share of the hourly budget. A stack tick is one summary query; the first tick of an anchor also pays the 1-point topology query. See [graphql-usage.md](graphql-usage.md).

| Situation                                                                                               | GraphQL                                                                                                                                                                                                                                     | REST                                                                       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Green `WAIT`, PR number passed, fingerprint **hit**                                                     | 1× `BatchPr` first page (cost 1), no supplements                                                                                                                                                                                            | READY-candidate mergeability refresh only                                  |
| Green `WAIT`, cold start or fingerprint **miss**, no extra pages, mergeable known, CheckSuites complete | 1× `BatchPr`                                                                                                                                                                                                                                | none                                                                       |
| CI failing (one workflow run)                                                                           | those plus `CheckRunAnnotationsBatch` (20 multi-annotation checks per request) and `CheckRunAnnotations` only for `hasNextPage`                                                                                                             | 1 jobs list (more if >100 jobs) + optional log excerpt                     |
| Large review PR                                                                                         | 1 batch + N slim page queries (combined cursors), not N full snapshots; plus thread-comment pages at concurrency 4                                                                                                                          | as above                                                                   |
| Head with unreported required checks                                                                    | plus 1× `BaseBehind` only when the live base tip or head commit moved since the cached compare. A native-stack layer adds the trunk compare on the same terms                                                                               | none (REST compare is conditional)                                         |
| PR in merge queue                                                                                       | batch metadata + `CommitCheckContexts` for the synthetic commit                                                                                                                                                                             | as above                                                                   |
| First-look minimize / classification auto-resolve                                                       | plus `BulkApply` mutation chunks (unmeasured)                                                                                                                                                                                               | none                                                                       |
| `--require-sha` on apply                                                                                | plus up to 10× `GetPrHeadSha`                                                                                                                                                                                                               | none                                                                       |
| `apply review` with reply IDs                                                                           | 1 `ApplyReviewPreflight` for up to 20 IDs (also the first SHA poll and first-batch recovery evidence); otherwise 1 `ReplyThreadTranscripts` per 20 requested IDs; extra `ReplyThreadComments` pages only for long threads, at concurrency 4 | none                                                                       |
| Non-root native-stack layer in a stack of more than 50 entries                                          | plus 1× `PollStackTopology` per 50 stack entries. A smaller stack's topology and trunk rules ride on `BatchPr`'s first page                                                                                                                 | none                                                                       |
| `--stack` summary                                                                                       | `PollStackSummary` pages sized to the stack, plus 1× `PollStackTopology` before the anchor's first summary. A resource-limit error halves that page down to one entry and rereads                                                           | 1× `GET /pulls/{n}` per open layer whose GraphQL mergeability is `UNKNOWN` |
| Explicit aggregate poll (`pr-shepherd A B ...`)                                                         | 1× `PollSummary` per 50 PRs                                                                                                                                                                                                                 | 1× `GET /pulls/{n}` per open PR whose GraphQL mergeability is `UNKNOWN`    |

Each iterate tick used to fetch a fresh full snapshot — there is no body cache across ticks. Unchanged **poll continuation** ticks stop after `BatchPr`'s first page, before any supplement (extra pages, thread-comment pages, merge-queue contexts), when that page's fingerprint matches the stored one (head SHA, `updatedAt`, comment/thread/review counts, comment and review `updatedAt` revisions, latest thread-comment revisions, latest comment/review ids, check-rollup state, check-suite identity and completeness, merge/queue flags, merge policy, stack membership, viewer login). New or edited review items change those fields and force a full fetch so the [comment visibility invariant](comments.md#first-look-items-comment-visibility-invariant) still holds. A different GitHub viewer login is a miss, so two tokens cannot reuse each other's classified report. A miss continues the same request into the full snapshot, so it costs no extra read. The fingerprint uses the same windows as `BatchPr`'s first page: the latest 20 review threads (with their first 100 comments), 100 PR comments, and 100 reviews.

Fingerprint reuse is **opt-in and internal to poll**. The tick returned to the caller always runs `BatchPr`: last bounded-poll tick (timeout remaining smaller than the next sleep), FIX_CODE debounce ticks, the post-debounce return tick, and every single-tick `iterate` / MCP call. A full fetch still **writes** the fingerprint so the next poll can skip.

Fingerprint skip is also refused — the tick runs `BatchPr` — when any of these hold:

- The cached report is `READY` (mark-ready / merge / ready-delay expiry must see a live snapshot).
- The cached report is not WAIT-shaped (first-look items, failing checks, actionable check annotations, visible approvals, merge-queue membership, and similar).
- More than 100 PR comments or reviews, more than 20 review threads, or any fingerprinted thread with more than one comment, exist, so `updatedAt` revisions on the first-page windows cannot cover an older in-place edit.
- `baseRef.rules` is truncated (`hasNextPage`), so merge-policy classification may be incomplete.
- The live `checkSuites(first: 50)` page is truncated (`hasNextPage`), so a later startup-failure suite would be invisible.
- REST mergeability differs from the cached report, including reports whose mergeability fields already diverged from the GraphQL fingerprint (a prior REST refresh turned GraphQL `UNKNOWN` into `BEHIND` / `PENDING`). GraphQL can stay `UNKNOWN` after REST returns `CLEAN`; a later REST `CLEAN` must not keep a cached `PENDING` forever.
- Classification inputs changed: `inputDigest` hashes report-shaping config (`ignoreChecks`, `botUsernames`, `iterate.*`, `watch.readyDelayMinutes`, `checks.*`, `mergeStatus.blockingReviewerLogins`, `actions.autoMinimizeSuppressed` / `autoMarkReady` / `neverCancelRuns` / `workWhileQueued`) plus **classification rule file contents**, not just paths.

The cached fingerprint's own queue, count, completeness, and rule-window checks run before the live preflight. A cached snapshot that cannot qualify therefore goes directly to `BatchPr`. Within one iterate tick, a non-root native-stack layer reuses one topology for both the bottom merge target and the stale-ancestry check. It comes from that tick's `BatchPr` first page, including on a fingerprint hit, or from a fresh `PollStackTopology` past 50 entries; the next tick reads it again.

## REST fallbacks

### `getMergeableState`

**When:** GraphQL returns `mergeable === 'UNKNOWN'` or `mergeStateStatus === 'UNKNOWN'` for an **OPEN** PR, or `runCheck` is about to return a candidate READY state. Aggregate polls (`--stack` and explicit PR lists) apply the same UNKNOWN fallback per PR in `poll-summary-mergeability.mts`, so a layer that just gained a conflict routes to `merge-conflicts` on the same tick instead of `pending-or-unknown`.

**Why:** GitHub computes `mergeable` asynchronously. GraphQL often returns UNKNOWN while the REST API already has the result. The REST endpoint (`GET /repos/{owner}/{repo}/pulls/{pull_number}`) returns the computed value faster. Its `state` and `merged_at` fields also let an already-required refresh detect a merge or close that raced the initial GraphQL snapshot; Shepherd does not make a separate terminal-state request.

**Not called for:** Merged or closed PRs — REST also returns UNKNOWN for those, and the REST call would be wasted. `check.mts` guards this with `batchData.state === 'OPEN'`; the aggregate poll guards on the summary PR's `state`.

### `getPrHeadSha`

**When:** `--require-sha` is set on `apply review` (or the MCP `apply` `review_mutations.requireSha` field).

**Why:** Shepherd needs to verify GitHub has received a push before resolving threads. This GraphQL query polls `headRefOid` until it matches the expected SHA.

### Startup-failure CheckSuites (GraphQL) + Actions REST fallback

**When:** GraphQL `statusCheckRollup` omits workflow runs that failed during startup before any jobs were created. The batch query reads `commit.checkSuites` and merges suites whose `conclusion` is `STARTUP_FAILURE` into the check list.

**REST fallback:** `GET /repos/{owner}/{repo}/actions/runs?head_sha=<sha>&status=startup_failure` runs only when CheckSuites are missing or `hasNextPage` is true. The result is filtered to the current PR's `pull_requests` association. Ordinary request failures log a warning and retain any data already fetched. A secondary rate limit instead aborts the tick with exit 75 so polling can back off. Extra REST pages stop if `x-ratelimit-remaining` is 0.

### Failed job log excerpts

**When:** A failing, non-cancelled, non-startup-failure GitHub Actions check has a matched job from the Actions jobs API.

**Why:** Some useful failure context, such as aggregate `needs` job results, is only present in job logs and not in GraphQL check-run fields or check annotations. Shepherd fetches `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs` and includes the first failed step's visible output (run-command group and post-step cleanup omitted) in the failing-check output. Ordinary request failures or empty logs omit the excerpt; a secondary rate limit aborts the tick with exit 75. Extra jobs-list pages stop if remaining is 0.

### Suggestion threads query

**When:** `build-suggestion-patches` needs PR head fields and an ordered set of review threads.

**Why:** A full `BATCH_PR_QUERY` snapshot would also pull CI, comments, and reviews. [`src/github/gql/suggestion-threads.gql`](../src/github/gql/suggestion-threads.gql) selects `headRefOid` / `headRefName` / `headRepository` plus `nodes(ids: $threadIds)`.

### Reply transcript read

**When:** `apply review` includes reply thread IDs and needs the pre-reply transcript for seen-marker bookkeeping.

**Why:** `ReplyThreadTranscripts` reads only those IDs, in batches of 20, and validates each thread belongs to the target repository and PR. `ReplyThreadComments` completes any transcript past 100 comments. At most four requests run concurrently. A missing or malformed page omits only its seen marker; all user-supplied reply IDs still reach GitHub's mutation.

### `apply review` preflight

**When:** `apply review` on GraphQL with 1 to 20 GraphQL reply thread IDs.

**Why:** `ApplyReviewPreflight` reads the PR `headRefOid`, `viewer.login`, and the requested threads' comment pages in one request (1 point). It replaces the first `GetPrHeadSha` poll, the `ReplyThreadTranscripts` read, and the first mutation batch's `ReplyRecoveryEvidence` read. Each part is accepted only under the same checks as its standalone read. Anything the preflight cannot verify falls back to that read: a thread past 100 comments, a thread that does not resolve, a request error, or a REST thread handle. Recovery evidence is reused for the `--adopt-existing-replies` scan and the first mutation batch, and only when `--require-sha` is absent or already matched, so a SHA poll wait never separates the evidence from the mutation.

## Rate limiting

`graphqlWithRateLimit` (in `github/graphql-http.mts`, re-exported from `http.mts` / `client.mts`) and `restWithRateLimit` parse `x-ratelimit-remaining` / `x-ratelimit-limit` / `x-ratelimit-reset` (and `Retry-After` when present). Failed REST calls throw `GitHubRequestError` with that metadata.

### What Shepherd already does

- One batch query per full tick; extra pages are slim `@include` documents with combined cursors.
- Merge-queue check rollups load only when the PR is queued or has a current removal whose parents still contain HEAD.
- Approved-review extra pages are opt-in (`iterate.minimizeApprovals`).
- A check run with exactly one annotation takes its body from `BatchPr`'s probe. Annotation bodies for other uncached probe-positive checks use `CheckRunAnnotationsBatch` (20 check runs per request; 21 connection-requests, calculated cost 1 point) and are cached for 1 hour per check-run id. A rate-limit error stops the remaining chunks instead of logging one line per check.
- Pagination and nested thread-comment hydration abort when remaining is 0 rather than returning a truncated thread list.
- `--verbose` prints command-scoped `apiUsage` (credential source, request count, measured query cost, node count, remaining/limit/reset).
- `PollSummaryAnnotationProbe` selects `rateLimit.cost`, so its primary-point spend is measured in that usage rather than counted as an unmeasured request.
- `watch.graphqlQuotaWarnings` (default 30% → 2x, 20% → 5x, 10% → 10x the configured `poll.intervalSeconds`) emits a one-shot-per-worktree-per-credential-per-window `quotaWarning` on non-terminal results for GraphQL and, with the same bands, REST `core`. An older sample in that window does not warn again; a changed credential fingerprint does. Each REST resource uses the fingerprint of the credential that supplied its own quota sample. A credential change accepts that credential's current sample even when its remaining budget is higher before the previous reset. Bands can instead use absolute `pollIntervalMinutes`, or specify both and take the slower result. The skill / MCP caller is told to slow down. It recommends an explicit REST `gh api repos/OWNER/REPO/pulls/PR` read for incidental work only when REST core is still above those bands. When both budgets are low, one combined warning uses the later reset and does not recommend moving work between them.
- The **poll dispatcher** (`pr-shepherd [PR]`, including `--until-terminal`, and aggregate `--stack` / multi-PR polls) also **applies** those bands: waiting sleeps use `max(effective interval, active band interval)` from the latest `apiUsage.graphql` remaining percent, every tick, even after the one-shot warning has already been claimed. Factors always use configured `poll.intervalSeconds` rather than an explicit flag or `poll.stackIntervalFactor`, preventing compounding; a slower explicit interval remains in force. Stack and multi-PR polls that omit `--interval` already use `poll.intervalSeconds * poll.stackIntervalFactor` (built-in 120s) as that effective interval, so with the defaults a stack sleeps 120s until a tighter band is slower than that. The active band is the crossed entry with the lowest `remainingPercent`, matching `quotaWarning`. Single-tick `iterate` and MCP `iterate` stay advisory — those callers own recurrence.
- Unchanged ticks skip `BatchPr` when the fingerprint matches, CheckSuites are complete, and REST mergeability still agrees with the cached report, including reports whose mergeability was previously filled in by REST.
- `BatchPr` loads the newest 20 review threads on the first page. GitHub prices the nested `comments` connection as one request per thread on that page, so 20 costs less than 100 on every full snapshot. Older threads still arrive on the slim page query.
- In `auto` mode, proven primary GraphQL exhaustion switches the operation and subsequent work to REST. `--until-terminal` keeps polling while a remaining rate limit is the only failure, including forced `graphql` mode or exhausted REST core. An exhausted primary limit (`remaining` 0, GraphQL or REST core) sleeps until `resetAt`, then 5 seconds, then `resetAt % 5` extra seconds, so the retry does not land on the reset instant. An explicit `Retry-After` is still honored in full. A secondary limit without `Retry-After` waits 60, 120, 240, 480, then 960 seconds across five consecutive responses; a sixth exits 75 if there was no successful tick. A later primary `resetAt` clears the no-progress count. An unchanged or missing primary `resetAt` backs off 15s, then 30s, then 60s; its sixth consecutive response exits 75. A successful tick clears either budget. Bounded polls and single-tick `iterate` still fail with 75 on the first rate-limit error.
- REST branch-policy reads propagate primary and secondary throttling, `Retry-After`, and session refusals. These responses cannot be treated as ordinary unavailable policy; polling retries throttling before making a readiness or merge decision.
- Only proven primary GraphQL exhaustion permits REST closure probes between sleep intervals. A secondary throttle never starts these probes, even if its response carried a GraphQL resource header. A merged or closed PR returns `CANCEL` without waiting out a primary reset. A REST core limit on the probe skips further probes for the rest of the sleep and does not throw. `--stack` / multi-PR polls probe each tracked open layer and return the all-terminal `CANCEL` only when every tracked layer is merged or closed. A partial merge keeps sleeping.

### How to read spend

1. Pass `--verbose` on iterate or poll. Markdown adds `## GitHub API usage`; JSON includes `apiUsage`.
2. `npx pr-shepherd log-file` — each GraphQL response line carries quota headers, cost, and credential source.
3. A `quotaWarning` / `## GitHub API quota warning` block is the primary remaining% crossing a configured band. It is **not** emitted for secondary limits.
4. Exit code 75 with `Retry-After` and a `secondary rate limit` message is a burst throttle, not an empty hourly bucket. Back off; do not assume REST is also exhausted.

### Operational advice

- **Give Shepherd its own credential when you need isolation.** The agent’s GitHub MCP, Copilot, and `gh api graphql` share the GraphQL pool with whatever token they use. A second PAT for the **same GitHub user** does not isolate quota. Use a GitHub App **installation** access token or a different GitHub user for a separate point budget; a dedicated PAT still helps with least-privilege and audit. See [authentication.md](authentication.md).
- **Always pass the PR number** (or URL / `owner/repo#N`) so Shepherd does not run `PrNumberByBranch`.
- **Do not also poll with GitHub MCP GraphQL** or `gh pr checks` / `gh pr watch`. Incidental one-off REST reads should name the endpoint explicitly, for example `gh api repos/OWNER/REPO/pulls/PR`.
- When a `quotaWarning` is returned, follow `## Instructions`: keep using pr-shepherd at the printed cadence. For `--until-terminal`, pass `--interval` from the warning and omit `--timeout`. Resume full cadence after the printed reset time.

### Optimization backlog

Landed in this spec’s matching code:

- Poll applies quota-band intervals (not only prints them).
- Fingerprint skip on unchanged ticks.
- Merge-queue check trees are follow-up-only.
- `--until-terminal` waits out a rate-limit reset (with a short margin) instead of exiting 75 on the first retry, and notices a merge or close during a long sleep via one REST pull read when REST core is available.
- `BatchPr` review threads start at 20.

Further work, if spend is still high:

- Ranked point-budget follow-ups are in [graphql-usage.md](graphql-usage.md).
- Token-scoped quota state so two worktrees sharing one credential share warned bands (today warnings are per worktree).
- Shrink `reviewThreads.comments(first: 100)` if `nodeCount` approaches 500,000 on huge PRs (point cost is mostly parent connections, not this `first`).
