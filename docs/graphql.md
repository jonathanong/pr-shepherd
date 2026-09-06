# shepherd GraphQL

[← README](../README.md) | [context.md](context.md)

This page is **how GitHub data is fetched**, **what each GraphQL operation costs**, and **how to keep a poll from exhausting the GraphQL quota**. A typical green tick is one GraphQL batch. Extra pages use a slim follow-up query. REST supplements run only where GraphQL cannot return the data.

Related: [authentication.md](authentication.md) (token pools), [configuration.md](configuration.md) (`watch.graphqlQuotaWarnings`), [debugging.md](debugging.md) (rate-limit exhaustion), [actions.md](actions.md) (quota-warning output).

## GitHub metering

GitHub meters GraphQL in **points per hour**, not HTTP requests. A typical user PAT is **5,000 points / hour**. GitHub App installation tokens can be higher. REST `core` is a **separate** pool; exhausting GraphQL does not exhaust REST, and vice versa.

[GitHub's cost formula](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api):

1. Count the connection-requests implied by the query AST. Nested `first`/`last` multiply by the parent connection size. Assume every connection fills its limit.
2. Divide by 100 and round to the nearest integer. Minimum cost is 1.

Example: `reviewThreads(last: 100) { comments(first: 100) }` is 1 (threads from the PR) + 100 (comments from each thread) = 101 connection-requests → cost 1 by itself. Combined with check-run annotation probes and merge-queue commit trees, a full `BatchPr` first page typically lands around **cost 4–8**. `--verbose` `GraphQL measured cost` is authoritative; do not guess from this page.

Other limits that are not the hourly point budget:

| Limit                 | What it is                                                                                                        | How Shepherd sees it                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Node cap              | A single query may not request more than **500,000** potential nodes (`first`/`last` multiplied through the tree) | Query rejected; not a quota warning                                                    |
| Primary GraphQL quota | `x-ratelimit-remaining` / `rateLimit.remaining` on resource `graphql`                                             | `apiUsage.graphql`, `quotaWarning`, pagination abort at remaining 0                    |
| Secondary rate limit  | Burst / concurrency / mutation abuse. **Does not** decrement remaining                                            | HTTP 403 with `Retry-After` and a `secondary rate limit` message; `EXIT.TEMPFAIL` (75) |

Mutations cannot select `rateLimit { cost }` (that field lives on the Query root). Shepherd records them as `unmeasuredRequestCount` and still reads remaining/limit from response headers.

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

The alias is merged with `x-ratelimit-*` headers in `github/api-telemetry.mts`. There is no extra `/rate_limit` REST call.

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

| Operation              | Document                                  | When it runs                                                                                      | Selects `rateLimit.cost` |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------ |
| `BatchPr`              | `batch-pr.gql`                            | Every full `runCheck` / iterate tick that does not hit a fingerprint skip                         | yes                      |
| `PrFingerprint`        | `pr-fingerprint.gql`                      | Every iterate tick after the first stored fingerprint, to decide whether the full batch is needed | yes                      |
| `BatchPrPage`          | `batch-pr-page.gql`                       | Extra connection pages; combined cursors                                                          | yes                      |
| `ReviewThreadComments` | `review-thread-comments.gql`              | A thread whose nested `comments` connection has another page                                      | yes                      |
| `CommitCheckContexts`  | `commit-check-contexts.gql`               | Merge-queue (or current-removal) commit check rollup, including page 1                            | yes                      |
| `CheckRunAnnotations`  | `check-run-annotations.gql`               | Completed check whose batch probe found at least one annotation (1h derived cache)                | yes                      |
| `SuggestionThreads`    | `suggestion-threads.gql`                  | `build-suggestion-patches`                                                                        | yes                      |
| `GetPrHeadSha`         | `get-pr-head-sha.gql`                     | `--require-sha` poll (`resolve.shaPoll`, default 2s × 10)                                         | yes                      |
| `PrNumberByBranch`     | `pr-number-by-branch.gql`                 | No PR number passed (avoid this — pass the number)                                                | yes                      |
| `GetPrBody`            | `get-pr-body.gql`                         | Journal apply, before the body mutation                                                           | yes                      |
| `UpdatePrBody`         | `update-pr-body.gql`                      | Journal apply                                                                                     | no (mutation)            |
| `MarkPrReady`          | `mark-pr-ready.gql`                       | `mark_ready` when `viewerCanUpdate`                                                               | no (mutation)            |
| `PullRequestFiles`     | inline in `mark-files-as-viewed.mts`      | `apply files`                                                                                     | yes                      |
| `BulkApply`            | runtime aliases in `comments/resolve.mts` | reply / resolve / minimize / dismiss, chunks of 10                                                | no (mutation)            |
| `markFileAsViewed`     | runtime aliases, chunks of 10             | `apply files`                                                                                     | no (mutation)            |

## Per-tick budget

Default poll interval is **60s**. Ready-delay is **10 minutes**. Repeating a “cheap” 4–8 point batch every minute is what burns the hourly budget, not a single snapshot.

| Situation                                                                                               | GraphQL                                                                                                            | REST                                                   |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Green `WAIT`, PR number passed, fingerprint **hit**                                                     | 1× `PrFingerprint` (cost 1)                                                                                        | READY-candidate mergeability refresh only              |
| Green `WAIT`, cold start or fingerprint **miss**, no extra pages, mergeable known, CheckSuites complete | 1× `BatchPr` (and `PrFingerprint` on a miss after the first tick)                                                  | none                                                   |
| CI failing (one workflow run)                                                                           | those plus annotation pages for probe-positive completed checks                                                    | 1 jobs list (more if >100 jobs) + optional log excerpt |
| Large review PR                                                                                         | 1 batch + N slim page queries (combined cursors), not N full snapshots; plus thread-comment pages at concurrency 4 | as above                                               |
| PR in merge queue                                                                                       | batch metadata + `CommitCheckContexts` for the synthetic commit                                                    | as above                                               |
| First-look minimize / classification auto-resolve                                                       | plus `BulkApply` mutation chunks (unmeasured)                                                                      | none                                                   |
| `--require-sha` on apply                                                                                | plus up to 10× `GetPrHeadSha`                                                                                      | none                                                   |

Each iterate tick used to fetch a fresh full snapshot — there is no body cache across ticks. Unchanged ticks now skip the full snapshot when [`pr-fingerprint.gql`](../src/github/gql/pr-fingerprint.gql) matches the stored fingerprint (head SHA, `updatedAt`, comment/thread/review counts, latest comment/review ids, check-rollup state, merge/queue flags). New or edited review items change those fields and force a full fetch so the [comment visibility invariant](comments.md#first-look-items-comment-visibility-invariant) still holds.

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

### What Shepherd already does

- One batch query per full tick; extra pages are slim `@include` documents with combined cursors.
- Merge-queue check rollups load only when the PR is queued or has a current removal.
- Approved-review extra pages are opt-in (`iterate.minimizeApprovals`).
- Annotation bodies are cached for 1 hour per completed check-run id.
- Pagination and nested thread-comment hydration abort when remaining is 0 rather than returning a truncated thread list.
- `--verbose` prints command-scoped `apiUsage` (credential source, request count, measured query cost, node count, remaining/limit/reset).
- `watch.graphqlQuotaWarnings` (default 30% → 2m, 20% → 5m, 10% → 10m) emits a one-shot-per-worktree-per-window `quotaWarning` on non-terminal results. The skill / MCP caller is told to slow down and to prefer REST `gh` for incidental work.
- The **poll dispatcher** (`pr-shepherd [PR]`, including `--until-terminal`) also **applies** those bands: `WAIT` / `MARK_READY` sleeps use `max(--interval, band interval)` from the latest `apiUsage.graphql` remaining percent, every tick, even after the one-shot warning has already been claimed. Single-tick `iterate` and MCP `iterate` stay advisory — those callers own recurrence.
- Unchanged ticks skip `BatchPr` when the fingerprint matches.
- `--until-terminal` retries a tick once after a GraphQL 429 / secondary-limit `Retry-After` (capped at 2 minutes) instead of exiting 75 immediately. Single-tick iterate still fails with 75.

### How to read spend

1. Pass `--verbose` on iterate or poll. Markdown adds `## GitHub API usage`; JSON includes `apiUsage`.
2. `npx pr-shepherd log-file` — each GraphQL response line carries quota headers, cost, and credential source.
3. A `quotaWarning` / `## GitHub API quota warning` block is the primary remaining% crossing a configured band. It is **not** emitted for secondary limits.
4. HTTP 75 with `Retry-After` and a `secondary rate limit` message is a burst throttle, not an empty hourly bucket. Back off; do not assume REST is also exhausted.

### Operational advice

- **Give Shepherd its own credential.** The agent’s GitHub MCP, Copilot, and `gh api graphql` share the GraphQL pool with whatever token they use. A dedicated fine-grained PAT (or GitHub App installation token) for `pr-shepherd` is the highest-leverage fix that needs no code. Tokens that still belong to the **same GitHub user** may share that user’s quota — see [authentication.md](authentication.md).
- **Always pass the PR number** (or URL / `owner/repo#N`) so Shepherd does not run `PrNumberByBranch`.
- **Do not also poll with GitHub MCP GraphQL** or `gh pr checks` / `gh pr watch`. Incidental one-off reads should use REST `gh` (`gh pr view`, `gh pr review`, `gh api` REST).
- When a `quotaWarning` is returned, follow `## Instructions`: keep using pr-shepherd at the printed cadence. For `--until-terminal`, pass `--interval` from the warning and omit `--timeout`. Resume full cadence after the printed reset time.

### Optimization backlog

Landed in this spec’s matching code:

- Poll applies quota-band intervals (not only prints them).
- Fingerprint skip on unchanged ticks.
- Merge-queue check trees are follow-up-only.
- `--until-terminal` honors GraphQL `Retry-After` once.

Further work, if spend is still high:

- Token-scoped quota state so two worktrees sharing one credential share warned bands (today warnings are per worktree).
- Shrink `reviewThreads.comments(first: 100)` if `nodeCount` approaches 500,000 on huge PRs (point cost is mostly parent connections, not this `first`).
