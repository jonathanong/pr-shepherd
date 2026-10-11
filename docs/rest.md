# shepherd REST

[← README](../README.md) | [github-api.md](github-api.md) | [context.md](context.md)

This page describes the REST transport: what a REST snapshot reads, how conditional reads keep unchanged ticks free, which fields REST cannot supply, and which operations it cannot perform. Transport selection (`auto`/`graphql`/`rest`, `CLAUDE_CODE_REMOTE`, fallback triggers), metering, and quota backoff are in [github-api.md](github-api.md). The REST calls GraphQL mode makes (mergeability refreshes, startup-failure runs, job logs, idle wait detectors) are in [graphql.md](graphql.md#rest-calls-in-graphql-mode).

Related: [rest-usage.md](rest-usage.md) (core requests per command and per tick), [escalations.md](escalations.md#transport-unsupported) (`transport-unsupported`), [configuration.md](configuration.md#github-api-transport).

## Snapshot coverage

REST reads use the core API pool and paginate list endpoints with `per_page=100` and GitHub's `Link` header. A full snapshot repeats the core PR read at the end and retries once when the head, base, or revision changes during pagination. REST does not use the GraphQL first-page fingerprint, because the REST snapshot cannot provide all policy, capability, and queue inputs needed to validate a cached report; it reuses reports through [conditional reads](#conditional-reads) instead.

A one-PR snapshot reads the pull, review comments, issue comments, reviews, the head's check runs, check suites, and statuses, Actions workflow runs, the base branch summary, the base branch rules, the stack lookup, the repository, the viewer (`/user`), and the pull again at the end. In a Claude Code cloud session it also reads `GET /pulls/{n}/ccr/review_threads`. Counts are in [rest-usage.md](rest-usage.md).

## Conditional reads

REST snapshot reads are conditional. Each `GET` sends `If-None-Match` with the ETag stored for that path under `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/rest-cache/` (removed by `admin clean`); a `304 Not Modified` replays the stored body, including its pagination `Link`, and consumes no primary quota. Because an item appended past a full page leaves that page's body and ETag unchanged, a 304 for a full page (100 items) with no `rel="next"` is immediately re-read without a validator so a new later page is never hidden. Pull reads whose mergeability GitHub is still computing (`mergeable: null` or `mergeable_state: unknown`) are never stored. Proxies and TLS verification behave as for any other REST request. `--verbose` reports 304s as `apiUsage.rest.<resource>.notModified` (text: `N not modified (304)`), omitted when 0; they are not counted in `requestCount` (text: `N requests`, likewise omitted when 0, as on an all-304 tick) and never affect rate-limit samples. When poll continuation ticks (the same internal opt-in as the GraphQL fingerprint skip) see every snapshot read return 304 with the same ETags the previous report was built from (a read from a route without ETags counts when its settled body is unchanged; see below), the stored report (`rest-report.json` in the same PR state directory) is reused with no further read. No separate mergeability read is needed: mergeability moves only when the head or the base moves, the head is in the pull body, and the base branch summary (`GET /branches/{base}`, which carries the base `commit.sha`) is one of the conditional reads, so a base push answers 200. A pull body whose mergeability is still being computed is never stored, so it cannot answer 304. Config changes, a non-reusable cached action, or any 200 response carrying an ETag or changed content rebuild the report. A route that sends no ETag cannot answer 304 (the Claude Code proxy's `GET /pulls/{n}/ccr/review_threads` is one), so its settled body is validated by a content hash instead: the read is still a charged 200, but an unchanged body does not block reuse as long as at least one other read in the tick answered 304. An unchanged REST wait tick therefore spends no core requests (one, the CCR thread read, in a Claude Code cloud session), and an unchanged native-stack or explicit-list summary tick (also conditional) spends none either.

The base branch summary also gates classic protection: when it reports `protection.enabled: false`, Shepherd skips `GET /branches/{base}/protection`, whose 404 answer could never be a free 304. When `/user` is denied (as for some installation tokens), the denial is remembered per credential for one hour so later ticks do not repeat a charged 4xx; the viewer stays unknown.

## Consistency retries

If the CCR thread list and inline-comment list disagree because feedback changed during the read, Shepherd re-reads the CCR threads and then the inline comments once. A persistent membership mismatch returns a retryable snapshot-changed error (`409`, exit `75`) instead of presenting incomplete feedback or treating the race as malformed data. Invalid payloads and duplicate memberships still fail as malformed data.

## Shared stack-tick evidence

REST stack polling shares repository merge settings, stack membership, and repeated branch-policy reads within one tick. Each layer still reads complete CI and feedback and verifies its PR revision; final membership and member-ref checks reject a moving stack. Shared evidence is discarded before the next tick.

## Fields REST cannot supply

REST returns raw check runs, workflow suites, review states, partial applicable branch rules, and native-stack membership where the endpoint supplies them. It does not currently report queue membership, enqueue state, or queue-removal history; queue metadata is retained only when a documented operation response supplies it. A generic 403/404 from classic branch-protection reads leaves protection unknown. An explicit 404 `Branch not protected` response proves classic protection absent; together with complete ruleset evidence it permits a known no-queue policy. A successful classic-protection read does not expose its queue requirement, so queue policy stays unknown unless an applicable ruleset positively requires a queue. Aggregate `reviewDecision` and viewer capabilities are unavailable.

The REST PR's `auto_merge` request is retained when present, including its merge method and enabler. REST provides no enable timestamp, so that field remains omitted. A merge-enabled session waits on an existing request instead of issuing another merge operation.

REST does not expose current merge-queue removal history. If a tick carries previously fetched removal evidence after switching to REST, Shepherd still surfaces the failed checks, but reports automatic same-head queue recovery and native-stack removal acknowledgment as `transport-unsupported` rather than printing commands that cannot revalidate the removal. Repeating an existing same-head merge request only resumes the old enqueue result. A definite old-head enqueue can still be replaced after a fresh read verifies a changed PR head.

## Claude Code proxy routes and unsupported operations

The observed Claude Code proxy contract includes `GET /pulls/{n}/ccr/review_threads`, `POST /pulls/{n}/ccr/comments/{comment_id}/resolve`, and `POST /pulls/{n}/ccr/ready_for_review`. These routes support thread reads, resolve, and mark-ready in REST mode. The corresponding unresolve, auto-merge, and convert-to-draft `ccr` routes have not had their request/response contracts verified, so Shepherd treats those operations as unsupported until they are recorded and implemented. REST also has no comment-minimize or file-view operation. Unsupported automatic cleanup is a surfaced one-look skip; an explicit requested operation returns a clear unsupported error or `transport-unsupported` handoff. See [escalations](escalations.md#transport-unsupported).

## Stack lookup and the `--expected-stack` guard

Native stacks use GitHub's `/stacks?pull_request=N` lookup followed by `/stacks/{number}`; an authoritative 404 is an error rather than evidence that the PR is a standalone branch. Generated REST stack merge commands bind the observed stack number, trunk, and ordered prefix with `--expected-stack`, so disappearing or changed membership cannot turn a stale stack command into a standalone merge.

Native stack summaries and topology reads also preserve an unavailable viewer identity as unknown, including with GitHub App installation tokens. An explicitly guarded stack merge still validates complete membership, ancestry, and current READY receipts; GitHub decides whether the requested mutation is authorized.

## Viewer identity and PR discovery

REST inline feedback retains viewer authorship by matching each actual author to the authenticated `/user` login. A viewer-owned root keeps reply-and-resolve routing, including resolve-only retries after a marked reply. An unavailable viewer identity stays unknown; a viewer-authored reply never grants ownership of another person's root. When complete CCR thread status proves an older review's associated threads all resolved or outdated, REST marks the review stale using the same predicate as GraphQL. Unknown thread status or a review without associated threads cannot prove staleness.

Current-branch PR discovery matches the head branch name across repository owners, including a fork's branch when `origin` points to the base repository. Journal reads retain the PR identity needed to complete a body update through REST if GraphQL quota runs out between the read and write.

## Rate limits

REST requests count against GitHub's `core` pool (see [GitHub metering](github-api.md#github-metering)). A `304 Not Modified` is not charged.

- REST branch-policy reads propagate primary and secondary throttling, `Retry-After`, and session refusals. These responses cannot be treated as ordinary unavailable policy; polling retries throttling before making a readiness or merge decision.
- A REST snapshot never uses the GraphQL fingerprint; an unchanged poll continuation tick is answered by conditional reads instead.
