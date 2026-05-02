# shepherd comments and threads

[← README](../README.md)

## Review threads vs PR comments

| Type           | Description                                             | GraphQL field                                  |
| -------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Review thread  | Inline code comment attached to a specific file + line  | `pullRequest.reviewThreads`                    |
| PR comment     | Top-level comment on the PR (not attached to a file)    | `pullRequest.comments`                         |
| Review summary | PR-level body of a COMMENTED review (e.g. bot overview) | `pullRequest.reviews(states: COMMENTED)` (new) |

Shepherd surfaces review threads and PR comments in the `report.threads` and `report.comments` fields respectively. Review summaries are also surfaced on `ShepherdReport` — as `reviewSummaries` (COMMENTED reviews) and `approvedReviews` (APPROVED-state reviews). All `COMMENTED` review summaries are always minimized by the `iterate` / monitor loop via `--minimize-comment-ids`. [`iterate.minimizeApprovals`](configuration.md#iterateminimizeapprovals) controls whether `APPROVED`-state reviews are also minimized (default off — approvals stay visible); it does not gate whether those fields are present on `ShepherdReport`. The manual `/pr-shepherd:resolve` skill reads summaries from `resolve --fetch`'s `reviewSummaries` array, which is separately gated by `resolve.fetchReviewSummaries`.

## `isOutdated` flag

GitHub sets `isOutdated: true` on a review thread when the commit the comment was originally attached to has been superseded by a newer push. Outdated threads are no longer blocking — the code they commented on no longer exists in the current state of the PR.

Shepherd auto-resolves outdated threads during the sweep step (when `autoResolve: true`).

## Auto-resolve path

1. `getOutdatedThreads(unresolvedThreads)` — filters for `isOutdated: true` threads from `batch.mts` data
2. `autoResolveOutdated(threadIds)` — fires GraphQL `resolveReviewThread` mutations in parallel
3. Resolved thread IDs and any errors are returned in `report.threads.autoResolved` and `report.threads.autoResolveErrors`

Auto-resolve happens in `check.mts` when `opts.autoResolve === true` (set by `iterate`).

## Actionable triage is LLM-side

Shepherd does **not** classify threads as "actionable" vs "informational" — that's the LLM's job. Shepherd surfaces:

- All active (non-outdated, unresolved, non-minimized) threads in `report.threads.actionable`
- Unresolved outdated or minimized threads in `report.threads.resolutionOnly`; these need a GitHub resolve mutation but do not require code edits unless the agent chooses to act on the body.
- All visible (non-minimized) PR comments in `report.comments.actionable`

The cron prompt reads these and decides what to fix.

## First-look items (comment visibility invariant)

Every review item must be surfaced to the agent **at least once**, even if it is outdated, resolved, or minimized. Items that would otherwise be silently dropped are presented on first encounter with a status tag (`outdated`, `resolved`, `minimized`, or `outdated, auto-resolved`) so the agent can acknowledge them.

After first display, a per-item seen-marker file is written under `$PR_SHEPHERD_STATE_DIR/<owner>-<repo>/<pr>/seen/<id>.json`. Subsequent fetches check the marker and suppress items already seen.

First-look items appear in:

- `resolve --fetch` output: `## First-look items` section in text; `firstLookThreads` / `firstLookComments` arrays in JSON.
- `iterate fix_code` output: same `## First-look items` section when `fix_code` fires for other reasons.

First-look items are for acknowledging status before acting. If a first-look thread also appears in `resolutionOnly`, its ID should be resolved through `--resolve-thread-ids`; otherwise, do not pass first-look-only IDs to mutation flags.

State module: `src/state/seen-comments.mts`.

## `--require-sha` polling

When `shepherd resolve --require-sha <SHA>` is used, shepherd polls `GET /repos/{owner}/{repo}/pulls/{pr}` for `headRefOid` until it matches `expectedSha`, then issues the resolve/minimize/dismiss mutations.

**Why:** Without this guard, shepherd might auto-merge before the reviewer sees the fix. The polling ensures GitHub has received the push and updated the PR head before any mutations fire.

**Polling:** Retries up to `resolve.shaPoll.maxAttempts` times with `resolve.shaPoll.intervalMs` delay. Any exception is retried; on the last attempt it is re-thrown.

## Mutation types

All mutations live in `comments/resolve.mts`:

| Mutation         | GraphQL file                      | What it does                                                                        |
| ---------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| Resolve thread   | `github/gql/resolve-thread.gql`   | Marks a review thread resolved                                                      |
| Minimize comment | `github/gql/minimize-comment.gql` | Hides a PR comment or review summary (`PullRequestReview` implements `Minimizable`) |
| Dismiss review   | `github/gql/dismiss-review.gql`   | Dismisses a CHANGES_REQUESTED review with a message                                 |

Review summary IDs (`PRR_…` from `reviewSummaries`) go through `--minimize-comment-ids`, not `--dismiss-review-ids`. The `dismiss` path is reserved for CHANGES_REQUESTED reviews.

## Applying reviewer suggestions

For review threads whose body contains a ` ```suggestion ` fenced block, `resolve --fetch` attaches a parsed `suggestion` field (`{ startLine, endLine, lines, author }`, where `lines: string[]` losslessly carries the replacement — `[]` means "delete these lines", `[""]` means "replace with one blank line") and emits `commitSuggestionsEnabled` mirroring `actions.commitSuggestions`. The agent can then invoke [`pr-shepherd commit-suggestion`](cli-usage.md#pr-shepherd-commit-suggestion-pr---thread-id-id---message) (singular) per thread — one thread at a time — to build a unified diff and produce the suggested commit message + body (with `Co-authored-by: <reviewer>` trailer). The CLI does not mutate the working tree or git history; the agent applies the patch, stages, commits, and resolves the thread using the `## Instructions` section in the output.
