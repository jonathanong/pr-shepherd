# Escalation boundary

`ESCALATE` is Shepherd's only human handoff. This page is the canonical, closed list of escalation triggers (the `EscalateTrigger` union in `src/types/escalate.mts`) and their exact predicates. Output shape: [actions.md](actions.md#escalate).

## Triggers

| Trigger                       | Fires when                                                                                                                                                                                            | What the human does                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `authorization-required`      | GitHub denied an otherwise-eligible automatic mark-ready operation (or GraphQL capability was false/unavailable and failed closed).                                                                   | Grant update access or mark the PR ready by hand.                                                          |
| `transport-unsupported`       | The selected transport cannot perform an operation the action needs, and it cannot be represented as a one-look skip or explicit apply error.                                                         | Rerun on a transport that supports it, or do the operation by hand.                                        |
| `check-follow-up-unavailable` | A failing check needs an approval only a human can grant (`ACTION_REQUIRED`), or the same checks stayed unchanged after one investigation `TRIAGE` tick.                                              | Approve the gate, or report the investigation and change CI configuration or permissions.                  |
| `triage-thrash`               | A retryable, located review thread stays unchanged and unresolved after `iterate.triage-attempts-per-thread` caller-visible `TRIAGE` results.                                                         | Decide the thread; optionally run the retained pending review commands.                                    |
| `merge-queue-removed`         | Merge mode is on, GitHub reports a current queue removal on an unchanged head, nothing is queued or auto-merging, no actionable failure explains it, and one investigation `TRIAGE` tick already ran. | Read GitHub's raw removal reason and decide whether to requeue.                                            |
| `merge-method-unavailable`    | Merge mode is on and the method Shepherd would print is disabled on the repository, or the repository enables no merge method. No merge command is printed.                                           | Fix `merge.method` / `merge.command-args` or repository merge settings.                                    |
| `stall-timeout`               | An enabled timeout expires: CI never starts, a `WAIT`/`TRIAGE` fingerprint stays unchanged, or a `stack` selection's layers can only wait.                                                            | Investigate why nothing moves.                                                                             |
| `required-checks-unreported`  | Required merge-target contexts still have no check run after one close/reopen of the current head, and no Actions workflow is running.                                                                | Report what the investigation found. Repository, CI-config, or branch-policy changes are a human decision. |
| `stall-state-unavailable`     | An enabled stall timeout cannot read or write its timer file, and the one repair tick already ran; or an investigation marker cannot be saved.                                                        | Fix `PR_SHEPHERD_STATE_DIR` or its permissions, then resume.                                               |

Any escalation from a tick with automatically selected review mutations keeps every non-empty resolve-only and `apply review` command under `pendingReviewCommands` (Markdown: `## Pending review commands`). This includes `triage-thrash` and stall conversions. Polling still pauses, and the commands stay available for human-directed recovery.

## Stack-level outcomes

`stack` mutates GitHub only through rule-driven [classification auto-resolve](actions.md#classification-auto-resolve). Its outcomes:

| Stack state                                                                                                                                                    | Result                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Owned layers still have autonomous work                                                                                                                        | `SHEPHERD` (non-terminal), with human blockers surfaced    |
| Every remaining layer can only wait, or the stack is queued                                                                                                    | `WAIT`                                                     |
| `--merge`, `--merge-ready`, or `--merge-through` and a ready in-scope prefix whose bottom open layer targets base                                              | `MERGE` with an agent-run `gh stack merge` for that prefix |
| Every open layer READY without `--merge`, only clean drafts with auto mark-ready disabled (row reason `draft-auto-mark-ready-disabled`), or every layer merged | `CANCEL`                                                   |
| Every remaining session belongs to another author, or a layer's state could not be read (`UNKNOWN`)                                                            | `WAIT` under the stack stall timer                         |
| A human decision remains (a closed-unmerged layer or another row hand-off) and no autonomous one-PR session remains                                            | `ESCALATE`                                                 |

Stack ticks can also escalate with `stall-timeout`, `stall-state-unavailable`, `merge-method-unavailable`, `unowned-stack-layers` (the requested merge would also land open layers the caller does not own), or `unapproved-stack-layer` (a layer joined the stack after a `--merge` or `--merge-ready` was requested), `merge-through-target-closed` (the `--merge-through` PR was closed without merging or left the stack), or `listed-pr-left-stack` (a listed PR is no longer a layer). These merge nothing and change nothing: the caller tells the user, then reruns with the covered PRs listed, the stack number, or `--merge-through`. For `unowned-stack-layers` alone, a request that already covers those layers (the whole stack, or every layer up to the target) needs no second ask: the caller runs the printed listing command at once. See the predicates below and [actions.md](actions.md#shepherd-actions).

## Complete predicates

### `authorization-required`

Automatic mark-ready was selected for an otherwise-ready draft, Shepherd attempted the selected transport's operation, and GitHub denied it. When GraphQL returns `viewerCanUpdate: false`, Shepherd hands off without attempting. REST has no capability field, so on the supported cloud CCR route it attempts and uses GitHub's response.

Not this trigger:

- A mark-ready rate limit stays retryable, including a message-only secondary throttle with a nonempty or absent primary quota sample; `--until-terminal` applies the normal throttle backoff.
- Denied or unverifiable generated review replies, thread resolutions, bot-review dismissals, and automatic cleanup. Shepherd surfaces the item once, omits the generated mutation, records the first look in its debug log, and suppresses the unchanged item later.
- Explicit `apply` review, journal, file-view, and merge/enqueue operations. They are attempted and GitHub's response is authoritative.
- Push access. It is a precondition for using Shepherd on the PR.

### `transport-unsupported`

The selected REST transport lacks an operation required by an autonomous action or explicit mutation. The escalation names the operation and the affected item.

| Operation on REST                                                                                                              | Outcome                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mark-ready without a CCR route (authorization unknown or allowed)                                                              | `ESCALATE` / `transport-unsupported`                                                                                                                                                        |
| Required readiness fields REST cannot supply (no CI in progress, merge state known)                                            | `ESCALATE` / `transport-unsupported`, naming each field and reason                                                                                                                          |
| Unknown thread status (`reviewThreads.status`) while GitHub reports `CLEAN` and branch policy requires conversation resolution | Not a gap: `CLEAN` proves no unresolved thread exists, so the PR can be READY. The threads are still surfaced once. Without that policy, or on any other merge state, the field stays a gap |
| Generated comment minimization                                                                                                 | One-look skip                                                                                                                                                                               |
| Explicit `apply` minimization or file-view                                                                                     | Explicit unsupported-operation error                                                                                                                                                        |
| Merge-queue and ordinary merge                                                                                                 | Supported; not presumed unsupported                                                                                                                                                         |
| Same-head queue recovery or native-stack acknowledgment                                                                        | Stays `TRIAGE` for the failed checks, with an explicit unsupported instruction and no recovery command (REST cannot verify current removal history)                                         |
| Explicit `apply queue-removal`                                                                                                 | Unsupported-operation error                                                                                                                                                                 |

A cloud proxy session-access refusal during mark-ready also uses this trigger and quotes the proxy message, including its repository-access instructions. Review mutations instead stop with exit `77` without recording the target as GitHub-denied; repairing session access makes the unchanged item retryable.

### `check-follow-up-unavailable`

At least one remaining failing check has no `rerunCommand` and is one of:

- `ACTION_REQUIRED`: a gate only a human can grant. This escalates immediately, with no investigation tick;
- a manual-only check the agent can investigate: `CANCELLED` or `STARTUP_FAILURE`, a GitHub Actions check with `runAttempt` greater than 1 and no nonblank included log excerpt, a check with `runId === null` and an empty or whitespace-only `detailsUrl`, or a check with a run ID but no nonblank included `logExcerpt` (or `relatedJobs[].logExcerpt`);
- evidence-bearing checks with no rerun: a failing external status with a non-empty `detailsUrl` once no workflow run is in progress, a later attempt (`runAttempt > 1`) with a nonblank log excerpt, or a merge-group failure with a nonblank log excerpt once the PR is no longer queued. These carry evidence, so their first tick is the ordinary `TRIAGE` showing the excerpt and annotations plus a `Playbook: "Check follow-up"` step (never an escalation), and they escalate only when they are the last blockers and the branch is not behind or conflicting.

A manual-only check is not escalated first. Shepherd returns one investigation `TRIAGE` with the raw checks under `## Failing checks`, says it cannot tell from GitHub's data why they failed, and points to `Playbook: "Check follow-up"` (open-ended starting points, not a checklist). The caller fixes a cause within the PR or makes no change and keeps its findings, and does not rerun or retrigger the checks, including with an empty or no-op commit. Shepherd records the head SHA and the check set (name, run ID, attempt) in `check-follow-up.json` in the PR state directory when it returns that tick; internal poll debounce ticks do not write it. The next presented tick with the same head and checks escalates, and the caller reports its diagnosis. A new head or a different check set investigates again.

It fires only when no autonomous work or newly surfaced one-look item remains: no conflicts, behind-base recovery for a later workflow attempt, surfaced actionable or resolution-only threads, actionable comments, pending comment minimizations, actionable changes-requested reviews, queued/first-look/edited review summaries, first-look threads/comments, actionable annotations, another failing check with an autonomous path, or a failed job whose workflow run still has an in-progress job.

- An unauthorized review item postpones the escalation for its one visibility tick; once its seen marker suppresses it, the manual-only check gets its investigation tick, then can escalate.
- An authorized bot, viewer-authored, or configured other-human thread with a generated mutation is repeatable work even without a source location.
- A stale human `CHANGES_REQUESTED` review does not postpone the handoff, but it is kept in the payload so the human sees every blocker.
- A failing external check with `runId === null` and a non-empty `detailsUrl` stays `TRIAGE` for its first presented tick. On later ticks while any workflow run is in progress and no other work remains, it returns `WAIT` (Codecov is the regression case); it then follows the investigation rule above.
- `escalate.checks[]` keeps the raw check details for the human. When the run is held on an environment approval, they include its `pendingDeployments[]` (environment, required reviewers, and whether the viewer can approve), so the human learns what to approve without opening the run. An `ACTION_REQUIRED` run with no listed environment (the fork "approve and run" gate) shows only the conclusion and URL.

### `triage-thrash`

- The thread must be retryable: non-null path and line, and every required review mutation authorized.
- Attempts advance only when a `TRIAGE` result containing the thread is returned to the caller. Internal poll/debounce ticks do not count.
- Editing the thread body resets its count.
- Each of the configured `TRIAGE` results repeats the pending review commands; the next unchanged tick escalates and retains them under `pendingReviewCommands`.
- Threads without a source location, threads suppressed by seen markers, and threads with unauthorized required mutations do not count. Unauthorized mutations are surfaced once, then suppressed. Authorized reply/resolve mutations still run by thread ID after GitHub clears the path or line.
- Authorized bot `CHANGES_REQUESTED` dismissals remain repeatable `TRIAGE` work, even after the stall window; the agent runs the emitted command without a handoff.

### `merge-queue-removed`

All of these hold:

- merge mode is enabled;
- no queue or auto-merge state is active;
- GitHub reports a latest merge-queue removal, newer than the latest enqueue;
- the PR head has verifiably not changed since that removal;
- no earlier actionable-work branch supplied a concrete fix;
- one investigation `TRIAGE` tick already ran for this head and removal.

The first presented tick for a head and removal is a `TRIAGE`, not an escalation: it prints the raw reason and actor in the `**queue removal**` header and says to update the head from the base and push when the reason names a conflict, an invalid merge commit, or a changed stack, to make no change and report when a person dequeued the PR, and never to enqueue (`Playbook: "Merge queue ejection"`). Shepherd records the head SHA, removal time, and queue commit in `queue-removal-follow-up.json` in the PR state directory when it returns that tick; internal poll debounce ticks do not write it. A push gives a new head and ends the removal's currency. The same removal unchanged on the next presented tick escalates, and the caller reports what it found.

Freshness check (GitHub's `timelineItems(last: 1, ...)` returns the latest removal regardless of age, so without it one old removal would escalate forever):

| Queue commit shape                 | Removal is stale when                                                                                                                                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge commit (PR head is a parent) | The head is no longer a parent, or a head-ref force-push happened after the removal (that SHA was pushed back for a new attempt).                                                                                                                                                      |
| Squash or rebase (single parent)   | The current head reached the PR after the removal. Shepherd dates that by the earliest `pull_request` or `pull_request_target` check suite on the head (workflow-run time if the suite time is absent), then the head's committer time; a later head-ref force-push supersedes either. |
| Removed queue commit unavailable   | Always (freshness cannot be checked, for example after garbage collection).                                                                                                                                                                                                            |

A newer enqueue also clears the removal. The raw removal fields still render in the merge-queue header every tick.

Failing queue CI is actionable and stays `TRIAGE`. GitHub's removal reason is a raw lowercase string; observed values are `failed_checks`, `merge_conflict`, `invalid_merge_commit`, `stack_invalidated`, and `merged`. Only `failed_checks` qualifies for the requeue plan or native-stack acknowledgment. The escalation keeps GitHub's raw reason, actor, timestamp, queue commit, and parent OIDs when available.

### Native-stack merge routing

Native-stack membership is not an escalation.

1. When a one-PR `--merge` poll reaches its ready delay, it writes the layer's READY receipt and returns non-terminal `TRIAGE` with `pr-shepherd stack <PR URL> --until-terminal --merge-through <PR URL>`, which merges that layer and the layers below it and leaves layers above it alone. Lower layers the caller did not list escalate `unowned-stack-layers` and nothing merges. This holds at every position, including position 1. GitHub rejects `--auto` on stacked PRs, and a plain `gh pr merge` would land a mid-stack layer into its unmerged parent instead of the stack trunk.
2. The aggregate command reconciles every open layer's READY receipt and linear ancestry and returns one of the [stack-level outcomes](#stack-level-outcomes).
3. A clean draft is marked ready by its own session without waiting for lower layers. A closed-unmerged layer is surfaced during `SHEPHERD` while another layer can proceed; otherwise it returns `ESCALATE`. A layer whose state GitHub did not return (`UNKNOWN`, row reason `unverified-stack-state`) is a fetch gap, not a human decision: the stack waits and retries under the stack stall timer, merges nothing above it, and escalates `stall-timeout` only if it never resolves.
4. With a ready in-scope prefix whose bottom open layer targets the stack base, `stack --merge`, `--merge-ready`, or `--merge-through` returns `MERGE` with `GH_REPO=<owner/repo> gh stack merge <PR number> --yes` and the allowed method flag for the highest ready layer. When trunk is ahead of the top layer's head (or the compare failed), a read-only `git merge-tree` pre-check against trunk comes first, and a conflict routes to the Branch update playbook instead of the merge. Rerun the same command until every layer merges and it returns `CANCEL`. If the repository allows no method for that command, it returns `ESCALATE` with `merge-method-unavailable`.

**Detection caveat:** GitHub's `stack` field can be absent even for a stacked PR (for example when stacks are unavailable on the repository). Absence means no signal, not "not stacked". Shepherd does not infer stackedness otherwise, because comparing the base to the default branch false-positives on any PR targeting a non-default branch. This is a known gap: absence only lets the ordinary merge path proceed. It does not confirm that a plain `gh pr merge --auto` is safe.

### `merge-method-unavailable`

`--merge` is enabled and Shepherd is about to print a merge command, but the method is not allowed: `merge.method` (or the strategy flag in `merge.command-args`) names a method the repository disables, or the repository disables merge commits, squash, and rebase. The result names the allowed methods and has no merge command.

- REST queue requests omit the direct method, so a disabled method never escalates them.
- When REST cannot read queue policy, a configured direct method cannot safely be applied to a `default` request. That is not this trigger: the tick is `WAIT` (a `stack` selection returns `WAIT` under the stack stall timer) and rereads policy on the next poll, and `stall-timeout` escalates if it stays unreadable.

### `stall-timeout`

| Path         | Condition                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI start     | The prospective result is `WAIT`, and an external status context — or a `PENDING`, `QUEUED`, `REQUESTED`, or `WAITING` check run with no start time — stays unstarted for the threshold, and one investigation `TRIAGE` tick already ran for this head and check set (see below).                                                                                            |
| Stable state | The prospective result is `WAIT` or `TRIAGE`, the stored fingerprint is unchanged, and its nonnegative age reaches the threshold. The fingerprint covers the action, the PR head commit GitHub reports (not the local `HEAD`), PR/merge/draft state, failing and in-progress checks, the latest merge-queue removal commit, actionable item IDs, and actionable annotations. |
| `stack`      | Every remaining layer's bounded probe can only report waiting ([the idle `WAIT`](actions.md#shepherd-actions)), so no one-PR session runs.                                                                                                                                                                                                                                   |

- **CI start investigation.** The first presented tick on which unstarted checks reach the threshold is a `TRIAGE`, not an escalation. It lists each unstarted check under `## Unstarted checks` (JSON `triage.stalledChecks[]`: name, raw status, run or external source, details URL, how long it has been unstarted, and any summary as a quoted block), outside `## Instructions`, so provider text cannot read as a step. The constant instructions say Shepherd cannot tell from GitHub's data why nothing started, and points to `Playbook: "CI start stall"` (open-ended starting points: runner labels and capacity, concurrency groups, environment approvals, spending limits, external apps, GitHub incidents). The caller fixes a cause within the PR and pushes, or makes no change and keeps its findings. Shepherd records the head SHA and the unstarted check names in `ci-start-follow-up.json` in the PR state directory when it returns that tick; internal poll debounce ticks do not write it. The same checks unchanged on the same head on the next presented tick escalate `stall-timeout` with `stalledChecks[]`. A new head or a different set investigates again. A stalled check with `pendingDeployments` (a deployment-environment approval, a known human gate) escalates at once.
- The threshold is `iterate.stall-timeout-minutes` (default 60) or `--stall-timeout`. A changed fingerprint resets the timer. A disabled timeout refreshes state and never escalates.
- A clean native-stack draft with automatic mark-ready disabled returns `CANCEL` before the stall guard.
- The stack timer lives in `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/stack-<number>/stack-stall.json`. It fingerprints the summary status plus each layer's head commit, draft state, READY receipt, and reasons. Every aggregate tick shares it (`--until-terminal`, a bounded poll, or MCP). A changed fingerprint resets it; any other stack plan or a disabled timeout clears it. The escalation names each waiting layer and why it waits.

### `required-checks-unreported`

The merge target requires status contexts with no check run and no status context on the head, no relevant Actions workflow is running, and Shepherd already emitted one close/reopen for that same head and context set (marker: `ci-retrigger.json` in the PR state directory). The earlier `TRIAGE` told the caller to investigate why nothing started (the "Required checks unreported" playbook lists open-ended starting points, not a checklist), fix a cause within the PR, retrigger once if the workflows should have run, and otherwise make no change. Reaching this trigger means the investigation tick and one retrigger did not start CI. The caller reports what it found; what remains is a repository, CI-configuration, or branch-policy change, or waiting out a GitHub incident.

- This fires immediately; it does not wait for `stall-timeout`.
- While the stack trunk compare is behind, the PR base compare (`baseBehindBy`) is behind, or the derived merge status is `BEHIND`, rebase and push stays the `TRIAGE` action. `mergeStateStatus` `BLOCKED` does not hide that compare. That path writes no marker, so a repeated rebase uses the ordinary stall timer. If the push does not start the checks, the next current head investigates and then takes this trigger.
- Failing checks, merge conflicts, and an in-progress Actions workflow never take this trigger.
- Other autonomous review work on the same tick stays `TRIAGE` without a second close; the trigger fires once that work is gone and the contexts are still missing.

### `stall-state-unavailable`

The stall timeout is enabled, and the one-PR timer (`iterate-stall.json`) or the stack timer (`stack-stall.json`) cannot be read or written.

- A missing file (`ENOENT`) is a normal first sighting. Corrupt JSON is also a miss, so one successful rewrite restarts the timer.
- Any other read error, an unsafe state key, or a failed write of a new or reset timer is this trigger.
- The first tick for a given error is not an escalation. It carries one repair step quoting the filesystem error (a `triage` for a tick with no work of its own, the tick's own work with the step added otherwise, an actionable `SHEPHERD` plan with a trailing instruction for a `stack` selection, so the aggregate loop returns it before another tick). A marker outside the state directory (`<tmpdir>/pr-shepherd-stall-repair-<hash>.json`, valid for an hour, not written on debounce preview ticks) records it, because the state directory is what failed. The randomized temporary file name in the error is ignored when comparing reasons. The same error on the next tick escalates with the suggestion quoting the filesystem error, or at once when that marker cannot be saved. A `stack` selection returns the same handoff as one instruction, `` `stall-state-unavailable` ``, naming the error.
- The same trigger fires when an investigation marker (`ci-start-follow-up.json` for the CI-start investigation, `queue-removal-follow-up.json` for a merge-queue removal) cannot be saved on the tick that would present the investigation: without it the investigation would repeat on every poll. The suggestion names the file and the error.
- `--stall-timeout 0` turns the guard off, so the original action stands. Disabling the timeout, or switching to a plan that is not an idle wait, still clears the timer on a best-effort basis.

## Non-escalating outcomes

- `TRIAGE` is always non-terminal: do the emitted work and iterate immediately.
- Aggregate rows can report `escalate` with a row reason: `closed-unmerged-dependency` (a lower layer closed without merging), `closed-unmerged-layer` (a closed layer with no open layer above it), and `mark-ready-authorization-required` (a draft layer the viewer cannot mark ready). These are row `reasons`, typed as `StackHandoffReason` in `src/types/escalate.mts`, not iterate `escalate.triggers`, so they are not `EscalateTrigger` members. The stack plan returns them as `ESCALATE` only after no owned autonomous session remains.
- Stack-level `SHEPHERD` is always non-terminal: complete the listed one-PR sessions and reselect the stack before any remaining human handoff.
- Closed or merged PRs return `CANCEL`, not `ESCALATE`.
