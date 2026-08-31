# shepherd GraphQL

[← README](../README.md) | [context.md](context.md)

This page is **how context is fetched**. A typical green tick is one GraphQL batch. Extra pages use a slim follow-up query. REST supplements run only where GraphQL cannot return the data.

## The batch query

**File:** [`src/github/gql/batch-pr.gql`](../src/github/gql/batch-pr.gql)

A single GraphQL query fetches everything shepherd needs per PR on the first page:

- PR state (`state`, `isDraft`, `mergeable`, `mergeStateStatus`, `reviewDecision`, `headRefOid`)
- Base-branch rules that apply to this PR (`baseRef.rules` from active repository/org rulesets, plus classic `branchProtectionRule`) — no extra round-trip
- Merge queue membership (`isInMergeQueue`, `isMergeQueueEnabled`, `mergeQueueEntry`) and GitHub stack membership (`stack`, `stackEntry`)
- Review threads (paginated backward, see below)
- PR comments (paginated backward)
- Reviews / changes-requested / commented / approved reviews (paginated backward)
- CI check runs (paginated forward, see below) and `checkSuites` (first 50, used for startup-failure detection). Each `CheckRun` includes an `annotations(first: 1)` probe so later annotation pagination runs only for checks that have at least one annotation.

`latestReviews` is capped at 100 and `reviewRequests` at 50; extra pages are not fetched. Copilot-in-progress detection can miss reviewers beyond those caps.

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

## REST fallbacks

### `getMergeableState`

**When:** GraphQL returns `mergeable === 'UNKNOWN'` or `mergeStateStatus === 'UNKNOWN'` for an **OPEN** PR, or `runCheck` is about to return a candidate READY state.

**Why:** GitHub computes `mergeable` asynchronously. GraphQL often returns UNKNOWN while the REST API already has the result. The REST endpoint (`GET /repos/{owner}/{repo}/pulls/{pull_number}`) returns the computed value faster. Its `state` and `merged_at` fields also let an already-required refresh detect a merge or close that raced the initial GraphQL snapshot; Shepherd does not make a separate terminal-state request.

**Not called for:** Merged or closed PRs — REST also returns UNKNOWN for those, and the REST call would be wasted. `check.mts` guards this with `batchData.state === 'OPEN'`.

### `getPrHeadSha`

**When:** `--require-sha` is set on `apply review` (or the MCP `apply` `review_mutations.requireSha` field).

**Why:** Shepherd needs to verify GitHub has received a push before resolving threads. This GraphQL query polls `headRefOid` until it matches the expected SHA.

### Startup-failure CheckSuites (GraphQL) + Actions REST fallback

**When:** GraphQL `statusCheckRollup` omits workflow runs that failed during startup before any jobs were created. The batch query reads `commit.checkSuites` and merges suites whose `conclusion` is `STARTUP_FAILURE` into the check list.

**REST fallback:** `GET /repos/{owner}/{repo}/actions/runs?head_sha=<sha>&status=startup_failure` runs only when CheckSuites are missing or `hasNextPage` is true. The result is filtered to the current PR's `pull_requests` association. This supplement is best-effort: if the Actions runs request fails, Shepherd logs a warning and continues with the GraphQL check data. Extra REST pages stop if `x-ratelimit-remaining` is 0.

### Failed job log excerpts

**When:** A failing, non-cancelled, non-startup-failure GitHub Actions check has a matched job from the Actions jobs API.

**Why:** Some useful failure context, such as aggregate `needs` job results, is only present in job logs and not in GraphQL check-run fields or check annotations. Shepherd fetches `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs` and includes a bounded raw excerpt in the failing-check output. This supplement is best-effort: if the log request fails or the log is empty, the field is omitted. Extra jobs-list pages stop if remaining is 0.

### Suggestion threads query

**When:** `build-suggestion-patches` needs PR head fields and an ordered set of review threads.

**Why:** A full `BATCH_PR_QUERY` snapshot would also pull CI, comments, and reviews. [`src/github/gql/suggestion-threads.gql`](../src/github/gql/suggestion-threads.gql) selects `headRefOid` / `headRefName` / `headRepository` plus `nodes(ids: $threadIds)`.

## Rate limiting

`graphqlWithRateLimit` (in `github/graphql-http.mts`, re-exported from `http.mts` / `client.mts`) and `restWithRateLimit` parse `x-ratelimit-remaining` / `x-ratelimit-limit` / `x-ratelimit-reset` (and `Retry-After` when present). Failed REST calls throw `GitHubRequestError` with that metadata.

Typical green wait tick (PR number passed, no extra pages, mergeable known, CheckSuites complete): **1 GraphQL batch**, no startup-failure REST.

CI failing (one workflow run): those plus 1 REST jobs list (more if the run has >100 jobs) and an optional log excerpt.

Large review PR: 1 batch + N slim page queries (combined cursors), not N full snapshots.

Each iterate tick fetches fresh data from the GitHub GraphQL API — there is no local cache.
