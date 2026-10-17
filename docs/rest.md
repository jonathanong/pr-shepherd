# shepherd REST

[← README](../README.md) | [github-api.md](github-api.md) | [context.md](context.md)

How the REST transport reads a PR: what a snapshot reads, how conditional reads keep unchanged ticks free, which fields REST cannot supply, and which operations it cannot perform. For contributors and for anyone running Shepherd in a Claude Code cloud session, where REST is the default.

Transport selection, metering, and backoff are in [github-api.md](github-api.md). REST calls made in GraphQL mode are in [graphql.md](graphql.md#rest-calls-in-graphql-mode). Request counts are in [rest-usage.md](rest-usage.md); handoffs in [escalations.md](escalations.md#transport-unsupported).

## Snapshot coverage

REST uses the `core` pool and paginates lists with `per_page=100` and the `Link` header. A one-PR snapshot reads:

| Read                                      | Notes                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /pulls/{n}`                          | First and again at the end; one retry if head, base, or revision moved during pagination           |
| Review comments, issue comments, reviews  | Paginated                                                                                          |
| Head check runs, check suites, statuses   | Paginated                                                                                          |
| Actions workflow runs                     |                                                                                                    |
| Base branch summary and base branch rules | Summary `protection.enabled: false` skips `GET /branches/{base}/protection`                        |
| Stack lookup                              | [Stack lookup](#stack-lookup-and-the---expected-stack-guard)                                       |
| Repository, viewer (`/user`)              | A denied `/user` is remembered per credential for 1 hour; the viewer stays unknown                 |
| `GET /pulls/{n}/ccr/review_threads`       | Claude Code cloud only. Ignores `per_page`/`page`, returns every thread in one response, no `Link` |

If the first pull read shows the PR merged, an `iterate` tick stops there: the `CANCEL` carries only identity and merge state, and `mergeRequirements` is listed under `transportUnavailable`. A closed, unmerged PR can be reopened, so it keeps the full snapshot.

REST does not use the GraphQL first-page fingerprint, because a REST snapshot cannot supply every policy, capability, and queue input needed to validate a cached report. It reuses reports through conditional reads instead.

## Conditional reads

Every snapshot `GET` sends `If-None-Match` with the ETag stored for that path under `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/rest-cache/` (removed by `admin clean`). A `304` replays the stored body, including its `Link`, and consumes no primary quota.

| Rule                                       | Detail                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full last page                             | A 304 for a 100-item page with no `rel="next"` is re-read without a validator, since an appended item leaves that page's ETag unchanged                                                                                                                                     |
| Mergeability still computing               | A pull with `mergeable: null` or `mergeable_state: unknown` is never stored, so it cannot answer 304                                                                                                                                                                        |
| Route without ETags (`ccr/review_threads`) | Validated by a content hash of the settled body. Still a 200 every tick; an unchanged body does not block reuse if another read answered 304. No `X-RateLimit-*` headers, so not charged to `core`                                                                          |
| Verbose output                             | 304s: `apiUsage.rest.<resource>.notModified` (text `N not modified (304)`), not in `requestCount`, never a rate-limit sample. Header-less reads: `apiUsage.unmeteredRestRequestCount` (text `REST requests without rate-limit headers (unmetered): N`). Each omitted when 0 |

Report reuse: on poll continuation ticks (the same internal opt-in as the GraphQL fingerprint skip), when every read returns 304 with the ETags the previous report was built from, the stored `rest-report.json` is replayed with no further reads. Config changes, a non-reusable cached action, or any 200 with an ETag or changed content rebuild it.

No separate mergeability read is needed: a change in `mergeable_state` (from CI or reviews, not only a branch move) makes the pull read answer 200, and a base push changes `GET /branches/{base}` (`commit.sha`). So an unchanged REST wait tick spends no core requests (cloud still sends the unmetered `ccr` read), and unchanged stack and explicit-list summaries spend none either.

## Consistency retries

If the `ccr` thread list and the inline-comment list disagree because feedback changed mid-read, Shepherd re-reads both once. A persistent membership mismatch returns a retryable snapshot-changed error (`409`, exit `75`). Invalid payloads and duplicate memberships fail as malformed data.

## Shared stack-tick evidence

Within one tick, REST stack polling shares repository merge settings, stack membership, and repeated branch-policy reads. Each layer still reads complete CI and feedback and verifies its revision; final membership and member-ref checks reject a moving stack. Shared evidence is discarded before the next tick.

## Fields REST cannot supply

| Data                                                       | REST behavior                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Check runs, suites, review states, native-stack membership | Raw, where the endpoint supplies them                                                                                                                        |
| Applicable branch rules                                    | Partial                                                                                                                                                      |
| Classic protection                                         | Generic 403/404 leaves it unknown. Explicit 404 `Branch not protected` proves it absent; with complete ruleset evidence that permits a known no-queue policy |
| Queue requirement                                          | Not exposed by a successful classic read; unknown unless an applicable ruleset requires a queue                                                              |
| Queue membership, enqueue state, removal history           | Not reported; queue metadata kept only when a documented operation response supplies it                                                                      |
| `reviewDecision`, viewer capabilities                      | Unavailable                                                                                                                                                  |
| `auto_merge`                                               | Kept with merge method and enabler; no enable timestamp. A merge-enabled session waits on an existing request instead of merging again                       |

If a tick carries removal evidence fetched before switching to REST, Shepherd still surfaces the failed checks but reports same-head queue recovery and native-stack removal acknowledgment as `transport-unsupported`. Repeating an existing same-head merge request only resumes the old enqueue result; a definite old-head enqueue can still be replaced after a fresh read verifies a changed head.

## Claude Code proxy routes and unsupported operations

| Route                                                 | Status                                       | Metered                    |
| ----------------------------------------------------- | -------------------------------------------- | -------------------------- |
| `GET /pulls/{n}/ccr/review_threads`                   | supported (thread reads)                     | no `X-RateLimit-*` headers |
| `POST /pulls/{n}/ccr/comments/{comment_id}/resolve`   | supported (resolve)                          | no headers                 |
| `POST /pulls/{n}/ccr/ready_for_review`                | supported (mark-ready)                       | no headers                 |
| `POST /pulls/{n}/ccr/comments/{comment_id}/unresolve` | advertised, contract unverified; unsupported |                            |
| `PUT` / `DELETE /pulls/{n}/ccr/auto_merge`            | advertised, contract unverified; unsupported |                            |
| `POST /pulls/{n}/ccr/convert_to_draft`                | advertised, contract unverified; unsupported |                            |
| Reply `POST`, journal `PATCH /pulls/{n}`              | ordinary REST routes                         | yes                        |

The unverified routes are advertised in the proxy's GraphQL refusal (`403`, "GitHub GraphQL is not available from Claude Code sessions"). Header-less routes count in `unmeteredRestRequestCount` (observed in live run #566); header absence is not a measured zero, and any upstream spend is invisible.

- `ccr/review_threads` answering `404` with "Could not resolve to a PullRequest with the number of N" is an error (exit `69`); any other 404 leaves thread status unavailable.
- Proxy rate-limit headers are not one consistent sample: routes can report different `X-RateLimit-Used` and `Remaining` for one window ([github-api.md](github-api.md#github-metering)).
- REST has no comment-minimize or file-view operation. Unsupported automatic cleanup is a surfaced one-look skip; an explicitly requested operation returns an unsupported error or a `transport-unsupported` handoff.

## Thread IDs

REST names a thread `rest-thread-<rootCommentId>` (the numeric ID of its first inline comment), because REST routes return no thread node IDs. Pass these as printed to `apply review`; on REST they resolve to the root comment. If an earlier GraphQL tick recorded the thread's `PRRT_…` ID, the two are aliased: seen markers and fix-attempt counts carry over, and GraphQL mode translates the ID. Without a recorded alias, GraphQL mode fails with `No GraphQL thread identity for <id>; use --transport rest`.

## Bot status-comment edits

REST cannot minimize, so a first-look PR comment stays visible. A bot that edits its status comment in place (a "review in progress" summary, a rate-limit notice) changes the body hash. In live cloud run #566, under the pre-v1 10-minute ready-delay default, every such CodeRabbit edit used to cost one `FIX_CODE` tick and a fresh 10-minute countdown. An edited PR comment now never blocks readiness: a configured [ready delay](configuration.md#iterateready-delay-minutes--default-0) keeps counting down, and the latest body is shown once under [`## Edited comments`](actions.md#edited-comments) when the delay elapses. This follows the [comment visibility invariant](../AGENTS.md#comment-visibility-invariant) and is pinned by `src/commands/iterate/rest-bot-comment-edit.test.mts`.

## Stack lookup and the `--expected-stack` guard

Native stacks use `/stacks?pull_request=N` then `/stacks/{number}`. An authoritative 404 is an error, not evidence of a standalone branch. Generated REST stack merge commands bind the observed stack number, trunk, and ordered prefix with `--expected-stack`, so changed membership cannot turn a stale command into a standalone merge.

The topology read (membership before and after each layer's pull, plus the viewer) is conditional too, including when `iterate` runs it after the snapshot for ancestry. It shares the layer's ETag cache, so an unchanged layer tick charges none of its repeats ([rest-usage.md](rest-usage.md#one-pr)).

Summaries and topology reads keep an unavailable viewer as unknown, including with GitHub App installation tokens. A guarded stack merge still validates complete membership, ancestry, and current READY receipts; GitHub decides whether the mutation is authorized.

## Viewer identity and PR discovery

- Viewer authorship comes from matching each author to the `/user` login. A viewer-owned root keeps reply-and-resolve routing, including resolve-only retries after a marked reply. An unknown viewer stays unknown; a viewer-authored reply never grants ownership of someone else's root.
- When complete `ccr` thread status proves an older review's threads are all resolved or outdated, REST marks the review stale with GraphQL's predicate. Unknown thread status, or a review with no threads, cannot prove staleness.
- Current-branch PR discovery matches the head branch name across owners, including a fork branch when `origin` is the base repository.
- Journal reads keep the PR identity needed to finish a body update through REST if GraphQL quota runs out between read and write.

## Rate limits

REST counts against `core` ([GitHub metering](github-api.md#github-metering)); a 304 is free. Branch-policy throttling and session refusals propagate rather than reading as unavailable policy ([rate-limit backoff](github-api.md#rate-limit-backoff)).
