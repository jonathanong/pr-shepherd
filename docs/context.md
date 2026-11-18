# What one tick gathers

[← docs index](README.md) | [README](../README.md)

The context counterpart to [actions.md](actions.md): the fields one `iterate` tick surfaces so the agent needs no second GitHub fan-out. Fetching: [github-api.md](github-api.md). Turning it into an action: [iterate-flow.md](iterate-flow.md).

Debounce ticks in the poll dispatcher (`pr-shepherd [PR] --debounce`, default: `poll.debounce-seconds`; built-in 1m) run `iterate` with `persistSeen: false`. Seen markers and first-look suppression are deferred until the post-window tick, so late comments are not marked seen before the agent-facing result.

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

Inline review threads (full transcript, path, line, suggestion fence), top-level PR comments, and `COMMENTED`, `APPROVED`, and `CHANGES_REQUESTED` reviews are specified in [comments.md](comments.md). The first-look / edited / outdated / resolved / minimized gate is the [seen-marker invariant](comments.md#first-look-items-comment-visibility-invariant). Each item carries `authorType` (`User` / `Bot` / `Unknown`), raw `authorAssociation`, and true-only `viewerDidAuthor` ([trust and provenance](comments.md#trust-and-author-provenance)).

Thread handling is a matrix of author and thread state ([conversation-resolution.md](conversation-resolution.md)). In short:

- Bot, other non-human, and viewer-authored threads are replied to and resolved. Other humans' threads are reply-only unless `iterate.resolve-other-human-threads` is `outdated` or `always`.
- A leading `<!-- pr-shepherd -->` marker on the latest comment identifies an automated reply regardless of author, so a marked thread is resolve-only on retry. `resolutionOnlyThreads` holds unresolved outdated or minimized threads and marked retry threads.
- Eligible non-human comments and summaries can be minimized. Human items never are. Already-minimized `COMMENTED` reviews are not fetched, so their bodies never enter the seen-marker gate.

## CI context

Specified in [checks.md](checks.md): check runs and status contexts classified (passed / failing / in_progress / skipped / filtered / ignored / superseded); failed job name, failed step, and bounded log excerpt (omitted for `CANCELLED` and `STARTUP_FAILURE`); inline annotations on completed check runs (once per PR). Startup-failure CheckSuites use REST only when that page is missing or truncated ([graphql.md](graphql.md#startup-failure-checksuites-graphql--actions-rest-fallback)).

## Mutations the agent is expected to run

Context gathering also emits the arguments for later mutations so the agent does not reconstruct them:

- `apply review` command, printed inline in its instruction step (reply / resolve / minimize / dismiss, with an optional resolve-only `Run:` step)
- grouped `suggest` inputs when threads contain ` ```suggestion ` fences
- Optional `apply journal` advisory for recording why a code review suggestion is rejected

Those commands are actions, documented in [actions.md](actions.md) and [cli-usage.md](cli-usage.md).
