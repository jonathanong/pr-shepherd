# What one tick gathers

[← README](../README.md)

This is the context counterpart to [actions.md](actions.md). One `iterate` tick (or one poll that ends on an iterate result) surfaces the fields below so the agent does not need a second GitHub fan-out to reconstruct PR state.

How the data is fetched: [github-api.md](github-api.md) ([graphql.md](graphql.md), [rest.md](rest.md)). How it becomes an action: [iterate-flow.md](iterate-flow.md).

Debounce ticks in the poll dispatcher (`pr-shepherd [PR] --debounce`, default: `poll.debounceSeconds`; built-in 1m) run `iterate` with `persistSeen: false`. Seen markers and first-look suppression are deferred until the post-window tick, so late comments are not marked seen before the agent-facing result.

## Header

Always present after a sweep, except that lean output omits `**merge**`/`mergeStateStatus` when it is `CLEAN`, `**state**`/`state` when it is `OPEN`, and `**summary**`/`summary` when every count is zero (an absent field means that default):

| Text          | JSON                                                                  | Meaning                                                                                     |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `**status**`  | `status`                                                              | Shepherd rollup (`READY`, `UNRESOLVED_COMMENTS`, `FAILING`, …)                              |
| `**merge**`   | `mergeStateStatus` in lean JSON; derived `mergeStatus` in `--verbose` | GitHub mergeability after [deriveMergeStatus](merge-status.md)                              |
| `**state**`   | `state`                                                               | `OPEN` / `MERGED` / `CLOSED`                                                                |
| `**repo**`    | `repo`                                                                | `owner/repo`                                                                                |
| `**summary**` | `summary`                                                             | Passing / skipped / filtered / in-progress / superseded counts (zeros omitted in lean text) |

Shown when they apply:

| Text                                                | When                                        |
| --------------------------------------------------- | ------------------------------------------- |
| `**reviewDecision**` on the status line             | Derived merge status is `BLOCKED`           |
| `**branch** behind PR base branch \`<base>\``       | Derived merge is `BEHIND`                   |
| `**branch** conflicts with PR base \`<base>\``      | Derived merge is `CONFLICTS`                |
| `**branch** conflicts with stack trunk \`<trunk>\`` | `CONFLICTS` and `stackTrunkConflict` is set |
| `**remainingSeconds**`                              | Ready-delay countdown is active             |
| `**blockingBotReviewInProgress**`                   | A configured blocking reviewer is pending   |
| `**isDraft**`                                       | The PR is a draft                           |
| `**ignored**` / `**superseded**`                    | Matching checks exist                       |
| `**activity**`                                      | Commit / review-round / active-check rollup |

## Merge requirements

Printed after a sweep unless trivial:

- `Approvals: <None\|N[/M]> [Required\|Not Required]`, omitted when there are no approvals and none are required.
- `Conversations Resolved: <Yes\|No> [Required\|Not Required]`, omitted when resolution is known not to be required.

Lean JSON `mergeRequirements` drops the same entries.

Extra lines appear only when they apply (code-owner review, last-push approval, signed commits, linear history, branch up to date, required checks/deployments/workflows, code scanning, merge queue, stacks).

Do not infer “must wait for an approval” from `reviewDecision`. `REVIEW_REQUIRED` with no `Approvals:` line (none required) means GitHub is not waiting on an approval. Field contract: [merge-status.md](merge-status.md#merge-requirements).

## Review context

| Surface                                                                                                    | Spec                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Inline review threads (full transcript, path, line, suggestion fence when present)                         | [comments.md](comments.md)                                               |
| Top-level PR comments                                                                                      | [comments.md](comments.md)                                               |
| `COMMENTED` review summaries, `APPROVED` reviews, `CHANGES_REQUESTED` reviews                              | [comments.md](comments.md)                                               |
| First-look / edited / outdated / resolved / minimized items (seen-marker gate)                             | [comments.md](comments.md#first-look-items-comment-visibility-invariant) |
| `authorType` (`User` / `Bot` / `Unknown`), raw GitHub `authorAssociation`, and true-only `viewerDidAuthor` | [comments.md](comments.md#trust-and-author-provenance)                   |

An unmarked human inline thread authored by the authenticated viewer is replied to and resolved; bot/non-human threads use the same pairing. An unmarked other-human thread remains reply-only unless `iterate.resolveOtherHumanThreads` is `outdated` or `always`. A leading `<!-- pr-shepherd -->` marker on the latest comment identifies an automated reply regardless of account author, so a marked thread that is still being resolved is resolve-only on retry. `resolutionOnlyThreads` therefore includes unresolved outdated/minimized threads and active marked retry threads. Bot/non-human threads, comments, and eligible summaries can be resolved or minimized. Already-minimized `COMMENTED` reviews are not fetched (bodies never enter the seen-marker gate).

## CI context

| Surface                                                                                                                 | Spec                                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Check runs and status contexts, classified (passed / failing / in_progress / skipped / filtered / ignored / superseded) | [checks.md](checks.md)                                                              |
| Failed job name, failed step, bounded log excerpt                                                                       | [checks.md](checks.md) — omitted for `CANCELLED` and `STARTUP_FAILURE`              |
| Inline annotations on completed check runs (once per PR)                                                                | [checks.md](checks.md)                                                              |
| Startup-failure CheckSuites, with REST only when that page is missing or truncated                                      | [graphql.md](graphql.md#startup-failure-checksuites-graphql--actions-rest-fallback) |
| Reserved empty run-ID compatibility fields on `FIX_CODE` (no cancellation recommendation)                               | [actions.md](actions.md)                                                            |

## Mutations the agent is expected to run

Context gathering also emits the arguments for later mutations so the agent does not reconstruct them:

- `apply review` command, printed inline in its instruction step (reply / resolve / minimize / dismiss, with an optional resolve-only `Run:` step)
- grouped `build_suggestion_patches` inputs when threads contain ` ```suggestion ` fences
- Journal instruction for large decisions

Those commands are actions, documented in [actions.md](actions.md) and [cli-usage.md](cli-usage.md).
