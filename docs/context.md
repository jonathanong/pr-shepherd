# What one tick gathers

[← README](../README.md)

This is the context counterpart to [actions.md](actions.md). One `iterate` tick (or one poll that ends on an iterate result) surfaces the fields below so the agent does not need a second GitHub fan-out to reconstruct PR state.

How the data is fetched: [graphql.md](graphql.md). How it becomes an action: [iterate-flow.md](iterate-flow.md).

Debounce ticks in the poll dispatcher (`pr-shepherd [PR] --debounce`, default 1m) run `iterate` with `persistSeen: false`. Seen markers and first-look suppression are deferred until the post-window tick, so late comments are not marked seen before the agent-facing result.

## Header

Always present after a sweep:

| Text          | JSON                                                                  | Meaning                                                                                     |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `**status**`  | `status`                                                              | Shepherd rollup (`READY`, `UNRESOLVED_COMMENTS`, `FAILING`, …)                              |
| `**merge**`   | `mergeStateStatus` in lean JSON; derived `mergeStatus` in `--verbose` | GitHub mergeability after [deriveMergeStatus](merge-status.md)                              |
| `**state**`   | `state`                                                               | `OPEN` / `MERGED` / `CLOSED`                                                                |
| `**repo**`    | `repo`                                                                | `owner/repo`                                                                                |
| `**summary**` | `summary`                                                             | Passing / skipped / filtered / in-progress / superseded counts (zeros omitted in lean text) |

Shown when they apply:

| Text                                          | When                                        |
| --------------------------------------------- | ------------------------------------------- |
| `**reviewDecision**` on the status line       | Derived merge status is `BLOCKED`           |
| `**branch** behind \`origin/<base>\``         | Derived merge is `BEHIND`                   |
| `**branch** conflicts with \`origin/<base>\`` | Derived merge is `CONFLICTS`                |
| `**remainingSeconds**`                        | Ready-delay countdown is active             |
| `**blockingBotReviewInProgress**`             | A configured blocking reviewer is pending   |
| `**isDraft**`                                 | The PR is a draft                           |
| `**ignored**` / `**superseded**`              | Matching checks exist                       |
| `**activity**`                                | Commit / review-round / active-check rollup |

## Merge requirements

Always printed after a sweep:

- `Approvals: <None\|N[/M]> [Required\|Not Required]`
- `Conversations Resolved: <Yes\|No> [Required\|Not Required]`

Extra lines appear only when they apply (code-owner review, last-push approval, signed commits, linear history, branch up to date, required checks/deployments/workflows, code scanning, merge queue, stacks).

Do not infer “must wait for an approval” from `reviewDecision`. `REVIEW_REQUIRED` with `Approvals: None [Not Required]` means GitHub is not waiting on an approval. Field contract: [merge-status.md](merge-status.md#merge-requirements).

## Review context

| Surface                                                                            | Spec                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Inline review threads (full transcript, path, line, suggestion fence when present) | [comments.md](comments.md)                                               |
| Top-level PR comments                                                              | [comments.md](comments.md)                                               |
| `COMMENTED` review summaries, `APPROVED` reviews, `CHANGES_REQUESTED` reviews      | [comments.md](comments.md)                                               |
| First-look / edited / outdated / resolved / minimized items (seen-marker gate)     | [comments.md](comments.md#first-look-items-comment-visibility-invariant) |
| `authorType` (`User` / `Bot` / `Unknown`) and raw GitHub `authorAssociation`       | [comments.md](comments.md#trust-and-author-provenance)                   |

Human-authored threads are replied to, not resolved or minimized. Bot/non-human threads, comments, and eligible summaries can be resolved or minimized. Already-minimized `COMMENTED` reviews are not fetched (bodies never enter the seen-marker gate).

## CI context

| Surface                                                                                                                 | Spec                                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Check runs and status contexts, classified (passed / failing / in_progress / skipped / filtered / ignored / superseded) | [checks.md](checks.md)                                                              |
| Failed job name, failed step, bounded log excerpt                                                                       | [checks.md](checks.md) — omitted for `CANCELLED` and `STARTUP_FAILURE`              |
| Inline annotations on completed check runs (once per PR)                                                                | [checks.md](checks.md)                                                              |
| Startup-failure CheckSuites, with REST only when that page is missing or truncated                                      | [graphql.md](graphql.md#startup-failure-checksuites-graphql--actions-rest-fallback) |
| In-progress / protected / already-cancelled run IDs on `FIX_CODE`                                                       | [actions.md](actions.md)                                                            |

## Mutations the agent is expected to run

Context gathering also emits the arguments for later mutations so the agent does not reconstruct them:

- `apply review:` command (reply / resolve / minimize / dismiss, optional `resolve-only:` split)
- grouped `build_suggestion_patches` inputs when threads contain ` ```suggestion ` fences
- Journal instruction for large decisions

Those commands are actions, documented in [actions.md](actions.md) and [cli-usage.md](cli-usage.md).
