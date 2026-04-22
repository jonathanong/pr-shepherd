# shepherd comments and threads

[← README.md](README.md)

## Review threads vs PR comments

| Type           | Description                                             | GraphQL field                                  |
| -------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Review thread  | Inline code comment attached to a specific file + line  | `pullRequest.reviewThreads`                    |
| PR comment     | Top-level comment on the PR (not attached to a file)    | `pullRequest.comments`                         |
| Review summary | PR-level body of a COMMENTED review (e.g. bot overview) | `pullRequest.reviews(states: COMMENTED)` (new) |

Shepherd surfaces review threads and PR comments in the `report.threads` and `report.comments` fields respectively. Review summaries are not part of the `ShepherdReport` — they are surfaced only via `resolve --fetch` in the `reviewSummaries` array.

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

- All active (non-outdated, unresolved) threads in `report.threads.actionable`
- All visible (non-minimized) PR comments in `report.comments.actionable`

The cron prompt reads these and decides what to fix.

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

For review threads whose body contains a ` ```suggestion ` fenced block, `resolve --fetch` attaches a parsed `suggestion` field (`{ startLine, endLine, replacement, author }`) and emits `commitSuggestionsEnabled` mirroring `actions.commitSuggestions`. The agent can then invoke [`pr-shepherd commit-suggestions`](usage.md#pr-shepherd-commit-suggestions-pr---thread-ids-ab) to apply and resolve the threads in one shot via a server-side commit (`createCommitOnBranch`), co-crediting each reviewer with a `Co-authored-by` trailer. There is no GitHub API for this operation — shepherd parses the block and writes the commit itself, matching what the "Commit suggestion" UI button does.

After the mutation lands the local checkout is behind remote, so the command's output includes a `postActionInstruction` telling the agent to run `git pull --ff-only` before editing anything else.
