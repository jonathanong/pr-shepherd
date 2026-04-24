# shepherd GraphQL

[← README](../README.md)

## The batch query

**File:** `shepherd/github/gql/batch-pr.gql`

A single GraphQL query fetches everything shepherd needs per PR:

- PR state (`state`, `isDraft`, `mergeable`, `mergeStateStatus`, `reviewDecision`, `headRefOid`)
- Review threads (paginated backward, see below)
- PR comments (paginated backward)
- Reviews / changes-requested reviews (paginated backward)
- CI check runs (paginated forward, see below)

This single round-trip replaces the 6–12 API calls the former multi-agent design needed.

## Pagination strategy

Shepherd uses cursor-based GraphQL pagination. The direction depends on the data type:

| Data type      | Direction                                     | Cursor field  | Why                                                                             |
| -------------- | --------------------------------------------- | ------------- | ------------------------------------------------------------------------------- |
| Review threads | **Backward** (`last: N, before: startCursor`) | `startCursor` | Want the most recent threads first; need to walk earlier pages for full history |
| PR comments    | **Backward**                                  | `startCursor` | Same rationale as threads                                                       |
| Reviews        | **Backward**                                  | `startCursor` | Same rationale                                                                  |
| CI check runs  | **Forward** (`first: N, after: endCursor`)    | `endCursor`   | Checks are added chronologically; newest are at the end                         |

The generic paginator is in `github/pagination.mts`. It accepts a `direction` parameter and handles cursor tracking.

## REST fallbacks

### `getMergeableState`

**When:** GraphQL returns `mergeable === 'UNKNOWN'` or `mergeStateStatus === 'UNKNOWN'` for an **OPEN** PR.

**Why:** GitHub computes `mergeable` asynchronously. GraphQL often returns UNKNOWN while the REST API already has the result. The REST endpoint (`GET /repos/{owner}/{repo}/pulls/{pull_number}`) returns the computed value faster.

**Not called for:** Merged or closed PRs — REST also returns UNKNOWN for those, and the REST call would be wasted. `check.mts` guards this with `batchData.state === 'OPEN'`.

### `getPrHeadSha`

**When:** `--require-sha` flag is set on `resolve`.

**Why:** Shepherd needs to verify GitHub has received a push before resolving threads. This polls `headRefOid` until it matches the expected SHA.

## Rate limiting

`graphqlWithRateLimit` (in `github/client.mts`) parses the `x-ratelimit-remaining` header from GitHub's response and returns it in `BatchResult.rateLimit`. The value is available for callers to inspect; shepherd does not log warnings at any threshold by default.

Each iterate tick fetches fresh data from the GitHub GraphQL API — there is no local cache. Rate limit consumption is one batched request per tick.
