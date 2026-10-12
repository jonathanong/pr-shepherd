# Escalation boundary

`ESCALATE` is Shepherd's only human handoff. This page is the canonical, closed list of escalation triggers (the `EscalateTrigger` union in `src/types/escalate.mts`) and their exact predicates, for maintainers and for agents deciding what to hand to a human. Output shape is in [actions.md](actions.md#escalate).

## Triggers

| Trigger                       | Fires when                                                                                                                                                  | What the human does                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `authorization-required`      | GitHub denied an otherwise-eligible automatic mark-ready operation (or GraphQL capability was false/unavailable and failed closed).                         | Grant update access or mark the PR ready by hand.                                      |
| `transport-unsupported`       | The selected transport cannot perform an operation the action needs, and it cannot be represented as a one-look skip or explicit apply error.               | Rerun on a transport that supports it, or do the operation by hand.                    |
| `check-follow-up-unavailable` | Every remaining failing check has no autonomous follow-up, and no other autonomous work remains.                                                            | Inspect the check (approve, rerun, or fix CI) and resume.                              |
| `fix-thrash`                  | A retryable, located review thread stays unchanged and unresolved after `iterate.fixAttemptsPerThread` caller-visible `FIX_CODE` results.                   | Decide the thread; optionally run the retained pending review commands.                |
| `base-branch-unknown`         | The GraphQL base branch is empty or unsafe, and the tick has work that could require a push.                                                                | Fix the PR base, then resume.                                                          |
| `merge-queue-removed`         | Merge mode is on, GitHub reports a current queue removal on an unchanged head, nothing is queued or auto-merging, and no actionable failure explains it.    | Read GitHub's raw removal reason and decide whether to requeue.                        |
| `merge-method-unavailable`    | Merge mode is on and the method Shepherd would print is disabled on the repository, or the repository enables no merge method. No merge command is printed. | Fix `merge.method` / `merge.commandArgs` or repository merge settings.                 |
| `stall-timeout`               | An enabled timeout expires: CI never starts, a `WAIT`/`FIX_CODE` fingerprint stays unchanged, or a `--stack` selection's layers can only wait.              | Investigate why nothing moves.                                                         |
| `required-checks-unreported`  | Required merge-target contexts still have no check run after one close/reopen of the current head, and no Actions workflow is running.                      | Fix the workflow (path filters are the usual cause) so it emits the required contexts. |
| `stall-state-unavailable`     | An enabled stall timeout cannot read or write its timer file.                                                                                               | Fix `PR_SHEPHERD_STATE_DIR` or its permissions, then resume.                           |

Any escalation from a tick with automatically selected review mutations keeps every non-empty resolve-only and `apply review` command under `pendingReviewCommands` (Markdown: `## Pending review commands`). This includes `fix-thrash`, `base-branch-unknown`, and stall conversions. Polling still pauses; the commands stay available for human-directed recovery.

## Stack-level outcomes

Native-stack aggregate reconciliation (`--stack`) is read-only and never mutates GitHub.

| Stack state                                                                                       | Result                                                     |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Owned layers still have autonomous work                                                           | `SHEPHERD` (non-terminal), with human blockers surfaced    |
| Every remaining layer can only wait, or the stack is queued                                       | `WAIT`                                                     |
| `--merge` and a ready prefix whose bottom open layer targets base                                 | `MERGE` with an agent-run `gh stack merge` for that prefix |
| Every open layer READY without `--merge`, or every layer merged                                   | `CANCEL`                                                   |
| A human decision remains (closed or unverified topology) and no autonomous one-PR session remains | `ESCALATE`                                                 |

Stack ticks can also escalate with `stall-timeout`, `stall-state-unavailable`, or `merge-method-unavailable`; see the predicates below and [actions.md](actions.md#shepherd-actions).

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

| Operation on REST                                                                   | Outcome                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mark-ready without a CCR route (authorization unknown or allowed)                   | `ESCALATE` / `transport-unsupported`                                                                                                                  |
| Required readiness fields REST cannot supply (no CI in progress, merge state known) | `ESCALATE` / `transport-unsupported`, naming each field and reason                                                                                    |
| Generated comment minimization                                                      | One-look skip                                                                                                                                         |
| Explicit `apply` minimization or file-view                                          | Explicit unsupported-operation error                                                                                                                  |
| Merge-queue and ordinary merge                                                      | Supported; not presumed unsupported                                                                                                                   |
| Same-head queue recovery or native-stack acknowledgment                             | Stays `FIX_CODE` for the failed checks, with an explicit unsupported instruction and no recovery command (REST cannot verify current removal history) |
| Explicit `apply queue-removal`                                                      | Unsupported-operation error                                                                                                                           |

A cloud proxy session-access refusal during mark-ready also uses this trigger and quotes the proxy message, including its repository-access instructions. Review mutations instead stop with exit `77` without recording the target as GitHub-denied; repairing session access makes the unchanged item retryable.

### `check-follow-up-unavailable`

At least one remaining failing check has no `rerunCommand` and is one of:

- a GitHub Actions check with `runAttempt` greater than 1 and no nonblank included log excerpt (Shepherd's single rerun allowance is spent with no usable evidence), unless a behind/conflicting branch still provides a branch-refresh path;
- `ACTION_REQUIRED`, `CANCELLED`, or `STARTUP_FAILURE`;
- a check with `runId === null` and an empty or whitespace-only `detailsUrl`;
- a check with a run ID but no nonblank included `logExcerpt` (or `relatedJobs[].logExcerpt`).

It fires only when no autonomous work or newly surfaced one-look item remains: no conflicts, behind-base recovery for a later workflow attempt, surfaced actionable or resolution-only threads, actionable comments, pending comment minimizations, actionable changes-requested reviews, queued/first-look/edited review summaries, first-look threads/comments, actionable annotations, another failing check with an autonomous path, or a failed job whose workflow run still has an in-progress job.

- An unauthorized review item postpones the escalation for its one visibility tick; once its seen marker suppresses it, the manual-only check can escalate next tick.
- An authorized bot, viewer-authored, or configured other-human thread with a generated mutation is repeatable work even without a source location.
- A stale human `CHANGES_REQUESTED` review does not postpone the handoff, but it is kept in the payload so the human sees every blocker.
- A failing external check with `runId === null` and a non-empty `detailsUrl` stays `FIX_CODE`: the URL is an autonomous investigation path (Codecov is the regression case).
- `escalate.checks[]` keeps the raw check details for the human.

### `fix-thrash`

- The thread must be retryable: non-null path and line, and every required review mutation authorized.
- Attempts advance only when a `FIX_CODE` result containing the thread is returned to the caller. Internal poll/debounce ticks do not count.
- Editing the thread body resets its count.
- Each of the configured `FIX_CODE` results repeats the pending review commands; the next unchanged tick escalates and retains them under `pendingReviewCommands`.
- Threads without a source location, threads suppressed by seen markers, and threads with unauthorized required mutations do not count. Unauthorized mutations are surfaced once, then suppressed. Authorized reply/resolve mutations still run by thread ID after GitHub clears the path or line.
- Authorized bot `CHANGES_REQUESTED` dismissals remain repeatable `FIX_CODE` work, even after the stall window; the agent runs the emitted command without a handoff.

### `base-branch-unknown`

The GraphQL base branch is empty or contains characters outside `[A-Za-z0-9._/-]`, and a push is plausible: the tick has a retryable actionable or resolution-only thread, failing check, actionable annotation, conflict, actionable changes-requested review, or actionable comment. Skipped review mutations and unlocated threads do not make a push plausible. Rebasing onto the wrong base is worse than pausing.

### `merge-queue-removed`

All of these hold:

- merge mode is enabled;
- no queue or auto-merge state is active;
- GitHub reports a latest merge-queue removal, newer than the latest enqueue;
- the PR head has verifiably not changed since that removal;
- no earlier actionable-work branch supplied a concrete fix.

Freshness check (GitHub's `timelineItems(last: 1, ...)` returns the latest removal regardless of age, so without it one old removal would escalate forever):

| Queue commit shape                 | Removal is stale when                                                                                                                                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge commit (PR head is a parent) | The head is no longer a parent, or a head-ref force-push happened after the removal (that SHA was pushed back for a new attempt).                                                                                                                                                      |
| Squash or rebase (single parent)   | The current head reached the PR after the removal. Shepherd dates that by the earliest `pull_request` or `pull_request_target` check suite on the head (workflow-run time if the suite time is absent), then the head's committer time; a later head-ref force-push supersedes either. |
| Removed queue commit unavailable   | Always (freshness cannot be checked, for example after garbage collection).                                                                                                                                                                                                            |

A newer enqueue also clears the removal. The raw removal fields still render in the merge-queue header every tick.

Failing queue CI is actionable and stays `FIX_CODE`. GitHub's removal reason is a raw lowercase string; observed values are `failed_checks`, `merge_conflict`, `invalid_merge_commit`, `stack_invalidated`, and `merged`. Only `failed_checks` qualifies for the requeue plan or native-stack acknowledgment. The escalation keeps GitHub's raw reason, actor, timestamp, queue commit, and parent OIDs when available.

### Native-stack merge routing

Native-stack membership is not an escalation.

1. When a one-PR `--merge` poll reaches its ready delay, it writes the layer's READY receipt and returns non-terminal `FIX_CODE` with `pr-shepherd --stack <PR URL> --until-terminal --merge`. This applies at every position, including position 1: `--auto` is rejected server-side on stacked PRs, and a plain `gh pr merge` fallback would land a mid-stack layer into its unmerged parent instead of the stack trunk.
2. The aggregate selector reconciles every open layer's READY receipt and linear ancestry and returns one of the [stack-level outcomes](#stack-level-outcomes).
3. A clean draft is marked ready by its own session without waiting for lower layers. Closed or unverified topology is surfaced during `SHEPHERD` while another layer can proceed; otherwise it returns `ESCALATE`.
4. With a ready prefix whose bottom open layer targets the stack base, `--stack --merge` returns `MERGE` with `GH_REPO=<owner/repo> gh stack merge <PR number> --yes` and the allowed method flag for the highest ready layer. Rerun the same selector until every layer merges and it returns `CANCEL`. If the repository allows no method for that command, it returns `ESCALATE` with `merge-method-unavailable`.

**Detection caveat:** GitHub's `stack` field is a public-preview API and can be absent even for a stacked PR (for example when Stacked PRs are disabled on the repository). Absence means no signal, not "not stacked". Shepherd does not infer stackedness otherwise (comparing the base to the default branch false-positives on any PR targeting a non-default branch). This is a known gap: absence only lets the ordinary merge path proceed; it does not confirm a plain `gh pr merge --auto` is safe.

### `merge-method-unavailable`

`--merge` is enabled and Shepherd is about to print a merge command, but the method is not allowed: `merge.method` (or the strategy flag in `merge.commandArgs`) names a method the repository disables, or the repository disables merge commits, squash, and rebase. The result names the allowed methods and has no merge command.

- REST queue requests omit the direct method, so a disabled method never escalates them.
- When REST queue policy is unknown, a configured direct method still escalates: it cannot safely be applied to a `default` request.

### `stall-timeout`

| Path         | Condition                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CI start     | The prospective result is `WAIT`, and an external status context — or a `PENDING`, `QUEUED`, `REQUESTED`, or `WAITING` check run with no start time — stays unstarted for the threshold.                                                                                                                                                                                       |
| Stable state | The prospective result is `WAIT` or `FIX_CODE`, the stored fingerprint is unchanged, and its nonnegative age reaches the threshold. The fingerprint covers the action, the PR head commit GitHub reports (not the local `HEAD`), PR/merge/draft state, failing and in-progress checks, the latest merge-queue removal commit, actionable item IDs, and actionable annotations. |
| `--stack`    | Every remaining layer's bounded probe can only report waiting ([the idle `WAIT`](actions.md#shepherd-actions)), so no one-PR session runs.                                                                                                                                                                                                                                     |

- The threshold is `iterate.stallTimeoutMinutes` (default 60) or `--stall-timeout`. A changed fingerprint resets the timer. A disabled timeout refreshes state and never escalates.
- A native-stack draft held by disabled mark-ready uses the same guard.
- The stack timer lives in `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/stack-<number>/stack-stall.json`. It fingerprints the summary status plus each layer's head commit, draft state, READY receipt, and reasons. Every aggregate tick shares it (`--until-terminal`, a bounded poll, or MCP). A changed fingerprint resets it; any other stack plan or a disabled timeout clears it. The escalation names each waiting layer and why it waits.

### `required-checks-unreported`

The merge target requires status contexts with no check run and no status context on the head, no relevant Actions workflow is running, and Shepherd already emitted one close/reopen for that same head and context set (marker: `ci-retrigger.json` in the PR state directory). A second close will not create a job the workflow does not emit; path filters are the usual cause.

- This fires immediately; it does not wait for `stall-timeout`.
- While the stack trunk compare is behind, the PR base compare (`baseBehindBy`) is behind, or the derived merge status is `BEHIND`, rebase and push stays the `FIX_CODE` action. `mergeStateStatus` `BLOCKED` does not hide that compare. That path writes no marker, so a repeated rebase uses the ordinary stall timer. If the push does not start the checks, the next current head investigates and then takes this trigger.
- Failing checks, merge conflicts, and an in-progress Actions workflow never take this trigger.
- Other autonomous review work on the same tick stays `FIX_CODE` without a second close; the trigger fires once that work is gone and the contexts are still missing.

### `stall-state-unavailable`

The stall timeout is enabled, and the one-PR timer (`iterate-stall.json`) or the stack timer (`stack-stall.json`) cannot be read or written.

- A missing file (`ENOENT`) is a normal first sighting. Corrupt JSON is also a miss, so one successful rewrite restarts the timer.
- Any other read error, an unsafe state key, or a failed write of a new or reset timer is this trigger.
- The suggestion quotes the filesystem error and says to fix `PR_SHEPHERD_STATE_DIR` or the directory permissions, then resume. A `--stack` selection returns the same handoff as one instruction, `` `stall-state-unavailable` ``, naming the error.
- `--stall-timeout 0` turns the guard off, so the original action stands. Disabling the timeout, or switching to a plan that is not an idle wait, still clears the timer on a best-effort basis.

## Non-escalating outcomes

- `FIX_CODE` is always non-terminal: do the emitted work and iterate immediately.
- Stack-level `SHEPHERD` is always non-terminal: complete the listed one-PR sessions and reselect the stack before any remaining human handoff.
- Closed or merged PRs return `CANCEL`, not `ESCALATE`.
- Ordinary non-force pushes never produce `authorization-required`.
- Missing-location threads and unauthorized review mutations are surfaced/logged once and skipped.
- Failing queue CI and URL-backed external checks stay actionable `FIX_CODE` work.
