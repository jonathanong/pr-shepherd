# shepherd comments and threads

[← README](../README.md)

## Review threads vs PR comments

| Type           | Description                                             | GraphQL field                                  |
| -------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Review thread  | Inline code comment attached to a specific file + line  | `pullRequest.reviewThreads`                    |
| PR comment     | Top-level comment on the PR (not attached to a file)    | `pullRequest.comments`                         |
| Review summary | PR-level body of a COMMENTED review (e.g. bot overview) | `pullRequest.reviews(states: COMMENTED)` (new) |

Shepherd surfaces review threads and PR comments in the `report.threads` and `report.comments` fields respectively. Review threads include the original top comment fields (`body`, `author`, `url`, and `reviewId` when GitHub exposes the parent review) plus a `comments[]` transcript containing every fetched comment/reply in the thread; text output renders that transcript without previews so agents do not need a second GitHub fetch to recover context. Review summaries are also surfaced on `ShepherdReport` — as `reviewSummaries` (COMMENTED reviews) and `approvedReviews` (APPROVED-state reviews). COMMENTED review summaries and visible PR comments are minimized by the `iterate` / monitor loop via `--minimize-comment-ids` only when their GitHub `authorType` matches [`iterate.minimizeComments`](configuration.md#iterateminimizecomments); COMMENTED review summaries are not minimized while any known inline child thread from the same review remains unresolved. Human-authored items are never minimized. Top-level [`botUsernames`](configuration.md#botusernames) extends detected bots for thread visibility, resolve routing, and minimization eligibility. [`iterate.minimizeApprovals`](configuration.md#iterateminimizeapprovals) controls whether `APPROVED`-state reviews are also considered for minimization (default off — approvals stay visible); it does not gate whether those fields are present on `ShepherdReport`.

## `isOutdated` flag

GitHub sets `isOutdated: true` on a review thread when the commit the comment was originally attached to has been superseded by a newer push. Outdated threads are no longer blocking — the code they commented on no longer exists in the current state of the PR.

Shepherd no longer auto-resolves outdated threads during the sweep step.

## Outdated-thread path

Outdated threads are fetched from `batch.mts` and surfaced under `report.threads.resolutionOnly` until GitHub reports `isResolved: true`. Seen markers suppress repeated first-look/body display, but they do not suppress unresolved outdated/minimized threads from resolution routing. Human-authored outdated threads are replied to by the generated resolve command; Shepherd does not mark them resolved. Bot/non-human outdated threads are routed to `--resolve-thread-ids` on every run until GitHub reports them resolved.

The legacy `actions.autoResolveOutdated` setting is retained for config compatibility but no longer causes a resolve mutation.

## Actionable triage is LLM-side

Shepherd does **not** classify threads as "actionable" vs "informational" — that's the LLM's job. Shepherd surfaces:

- All active (non-outdated, unresolved, non-minimized) threads in `report.threads.actionable`
- Unresolved outdated or minimized threads in `report.threads.resolutionOnly`; human-authored threads receive a reply, and bot/non-human threads are routed to `--resolve-thread-ids`.
- Visible (non-minimized) PR comments in `report.comments.actionable`. Comments excluded by `iterate.minimizeComments` are marker-gated, so unchanged seen comments are suppressed on later ticks instead of being sent to the agent forever.

Active human-authored threads are suppressed after their transcript is seen unless the transcript changes. Active detected/configured bot threads are returned every tick until resolved so Shepherd can keep asking the agent to resolve them. After Shepherd replies to a human thread, it writes a marker for both the pre-reply transcript and the expected post-reply transcript; this suppresses immediate stale refetches and prevents replying to the agent's own latest comment.

The loop prompt reads these and decides what to fix.

## First-look items (comment visibility invariant)

Every review item must be surfaced to the agent **at least once**, even if it is outdated, resolved, or minimized. Items that would otherwise be silently dropped are presented on first encounter with a status tag (`outdated`, `resolved`, or `minimized`) so the agent can acknowledge them. For review threads, the seen marker hashes the full thread transcript, so replies to an already-seen resolved/minimized/outdated thread re-surface the thread as edited with links to the thread comments.

After first display, a per-item seen-marker file is written under `$PR_SHEPHERD_STATE_DIR/<owner>-<repo>/<pr>/seen/<id>.json`. Subsequent fetches check the marker and suppress items already seen.

First-look items appear in `iterate fix_code` output as a `## First-look items` section in text and `firstLookThreads` / `firstLookComments` arrays in JSON.

First-look items are for acknowledging status before acting. If a first-look human thread also appears in `resolutionOnly`, its ID is replied to through `--reply-thread-ids`; otherwise, do not pass first-look-only IDs to mutation flags.

The same marker gate is used for visible PR comments and all review objects Shepherd surfaces (`COMMENTED` summaries, `CHANGES_REQUESTED` reviews, and `APPROVED` reviews): they are surfaced when new, suppressed when unchanged, and re-surfaced when the author edits the body.

When GitHub links an inline thread to a parent review, Shepherd records the review marker with sorted `inlineThreadIds`. The marker keeps the review body hash and child-thread relationship together, so later logic can avoid per-review child lookups and still defer review-summary minimization until known inline children are resolved.

State module: `src/state/seen-comments.mts`.

## `--require-sha` polling

When `pr-shepherd resolve --require-sha <SHA>` is used, shepherd polls the GraphQL `get-pr-head-sha.gql` query for `headRefOid` until it matches `expectedSha`, then issues the resolve/minimize/dismiss mutations.

**Why:** Without this guard, shepherd might auto-merge before the reviewer sees the fix. The polling ensures GitHub has received the push and updated the PR head before any mutations fire.

**Polling:** Retries up to `resolve.shaPoll.maxAttempts` times with `resolve.shaPoll.intervalMs` delay. Any exception is retried; on the last attempt it is re-thrown.

## Mutation types

Mutations are built in `comments/resolve.mts` and sent through GraphQL in batches:

| Mutation         | GraphQL mutation                  | What it does                                                                        |
| ---------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| Reply to thread  | `addPullRequestReviewThreadReply` | Replies to a human-authored review thread                                           |
| Resolve thread   | `resolveReviewThread`             | Marks a review thread resolved                                                      |
| Minimize comment | `minimizeComment`                 | Hides a PR comment or review summary (`PullRequestReview` implements `Minimizable`) |
| Dismiss review   | `dismissPullRequestReview`        | Dismisses a CHANGES_REQUESTED review with a message                                 |

Review summary IDs (`PRR_…` from `reviewSummaries`) go through `--minimize-comment-ids`, not `--dismiss-review-ids`. The `dismiss` path is reserved for CHANGES_REQUESTED reviews.

Mutation mode batches resolve/minimize/dismiss operations in groups of 10. On a
GitHub primary or secondary rate-limit response, Shepherd stops instead of
continuing through later IDs. The mutate result keeps the successful arrays
(`resolvedThreads`, `minimizedComments`, `dismissedReviews`) and adds pending
arrays for IDs that still need another run (`unresolvedThreads`,
`unminimizedComments`, `undismissedReviews`), plus `rateLimit` metadata when
GitHub provided retry or reset details.

## Applying reviewer suggestions

For review threads whose body contains a ` ```suggestion ` fenced block, `iterate fix_code` attaches a parsed `suggestion` field (`{ startLine, endLine, lines, author }`, where `lines: string[]` losslessly carries the replacement — `[]` means "delete these lines", `[""]` means "replace with one blank line") and emits commit-suggestion instructions when `actions.commitSuggestions` is enabled. The agent can then invoke [`pr-shepherd commit-suggestion`](cli-usage.md#pr-shepherd-commit-suggestion-pr---thread-id-id---message) (singular) per thread — one thread at a time — to build a unified diff and produce the suggested commit message + body (with `Co-authored-by: <reviewer>` trailer). The CLI does not mutate the working tree or git history; the agent applies the patch, stages, commits, and resolves the thread using the `## Instructions` section in the output.
