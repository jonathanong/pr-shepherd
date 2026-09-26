# Escalation boundary

`ESCALATE` is Shepherd's explicit human-handoff action. For a singular PR it uses the closed trigger
union below. Native-stack aggregate reconciliation remains read-only: autonomous unready layers
return stack-level `SHEPHERD`, queued stacks return `WAIT`, and terminal READY or merged stacks return `CANCEL`.
Aggregate `ESCALATE` is reserved for genuine human decisions such as closed or unverified topology,
after no autonomous one-PR Shepherd session remains.
Aggregate mode never performs a mutation; a `--stack --merge` result emits an agent-run
`gh stack merge` command for the highest ready prefix.

| Trigger                       | Exact condition                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authorization-required`      | Shepherd is about to automatically mark a draft ready and `viewerCanUpdate !== true`. Explicit merge/enqueue requests are attempted and surface GitHub's actual error instead.                       |
| `check-follow-up-unavailable` | At least one remaining failing check has no autonomous follow-up, and no other autonomous work remains in the tick.                                                                                  |
| `fix-thrash`                  | A retryable, located review thread remains unchanged and unresolved after appearing in `iterate.fixAttemptsPerThread` caller-visible `FIX_CODE` results; the following unchanged tick escalates.     |
| `base-branch-unknown`         | The GraphQL base branch is empty or unsafe and the current tick has work that could require a push, so Shepherd cannot name a safe rebase target.                                                    |
| `merge-queue-removed`         | Merge mode is enabled, GitHub reports a queue removal, the head has not changed since removal, no queue/auto-merge state remains, and no earlier branch found an actionable failure or concrete fix. |
| `stall-timeout`               | An enabled timeout expires for CI that never starts, an unchanged `WAIT`/`FIX_CODE` state fingerprint, or a `--stack` selection whose layers can only wait.                                          |
| `required-checks-unreported`  | Required merge-target contexts still have no check run after one close/reopen of this head, and no Actions workflow is running.                                                                      |
| `stall-state-unavailable`     | An enabled stall timeout cannot read or write its timer. The tick hands off instead of treating the failure as a new first sighting.                                                                 |

## Complete predicates

### `authorization-required`

This trigger covers one operation family:

1. Mark ready: automatic mark-ready was selected for an otherwise-ready draft PR, but `viewerCanUpdate !== true`.

Denied or unverifiable generated review replies, thread resolutions, bot-review dismissals, and automatic cleanup do not escalate. Shepherd surfaces the affected item once, omits the generated mutation, records that first-look output in its normal debug log, and suppresses the unchanged item on later ticks. Explicit `apply` review, journal, file-view, and merge/enqueue operations are attempted; GitHub's response is authoritative. Push access is also not an escalation trigger; it is a precondition for using Shepherd on the PR.

### `check-follow-up-unavailable`

At least one remaining failing check has no `rerunCommand` and is one of:

- a GitHub Actions check whose `runAttempt` is greater than 1 and has no nonblank included log excerpt, meaning Shepherd's single rerun allowance is exhausted with no usable failure evidence (unless a behind/conflicting branch still provides a branch-refresh path);
- `ACTION_REQUIRED`, `CANCELLED`, or `STARTUP_FAILURE`;
- a check with `runId === null` and an empty or whitespace-only `detailsUrl`; or
- a check with a non-null run ID but no nonblank included `logExcerpt`.

The trigger fires only when no autonomous work or newly surfaced one-look item remains: no conflicts, behind-base recovery for a later workflow attempt, currently surfaced actionable or resolution-only threads, actionable comments, pending comment minimizations, actionable changes-requested reviews, queued/first-look/edited review summaries, first-look threads/comments, actionable annotations, another failing check with an autonomous path, or a failed job whose workflow run still has an in-progress job. An unauthorized review item can therefore postpone this escalation for its one visibility tick; after its seen marker suppresses it, the manual-only check may escalate on the next tick. An authorized bot, viewer-authored, or configured other-human thread with a generated mutation is repeatable work even without a source location. A stale human `CHANGES_REQUESTED` review does not postpone the handoff, but it is preserved in the escalation payload so the human sees every remaining blocker.

A failing external check with `runId === null` and a non-empty `detailsUrl` stays `FIX_CODE`. Codecov is the regression case: its URL is an autonomous investigation path even without a GitHub Actions run ID.

### `fix-thrash`

The thread must be retryable: it has a non-null path and line and every required review mutation is authorized. Attempts advance only when a `FIX_CODE` result containing that thread is returned to the caller; internal poll/debounce ticks do not count. Editing the body resets that thread's attempt count. The configured number of `FIX_CODE` results all include the pending review commands, and the following unchanged tick escalates with those commands retained under `pendingReviewCommands`.

Active threads without a source location do not count toward `fix-thrash`. Unauthorized review mutations are surfaced once, then suppressed. Authorized reply/resolve mutations still run by thread ID when GitHub has cleared the path or line, without counting toward `fix-thrash`.

Any escalation produced from a tick that has automatically selected review mutations retains all non-empty `resolve-only` and `apply review` commands. This includes review work accompanying `fix-thrash`, `base-branch-unknown`, and a stall conversion. The escalation still pauses automated polling; the commands remain available for the human-directed recovery. Authorized bot `CHANGES_REQUESTED` dismissals remain repeatable `FIX_CODE` work, even after the stall window; the agent runs the emitted command without a human handoff.

### `base-branch-unknown`

The GraphQL base branch is empty or contains characters outside `[A-Za-z0-9._/-]`, and a push is plausible because the tick contains a retryable actionable or resolution-only thread, failing check, actionable annotation, conflict, actionable changes-requested review, or actionable comment. Skipped review mutations and unlocated threads do not make a push plausible.

### `merge-queue-removed`

All of the following are true:

- merge mode is enabled;
- no queue or auto-merge state is active;
- GitHub reports a latest merge-queue removal;
- the PR head was not updated after that removal, **and this is verifiable** — GitHub's `timelineItems(last: 1, ...)` keeps returning the single most recent removal event regardless of age, so a PR removed from the queue once and never re-added would otherwise re-trigger this escalation forever. A merge-commit queue lists the PR head as a parent of the removed queue commit, so a later push is visible when that head is no longer a parent. A squash or rebase queue commit has a single parent on the base and does not list the PR head; that removal stays current until this head reached the PR after the removal. Shepherd reads that from the earliest `pull_request` or `pull_request_target` check suite time on the head commit, using the workflow-run time when the suite time is absent, and falls back to the head's committer time only when neither is available. When GitHub omits the removed queue commit for that event (for example after it is garbage collected), freshness cannot be checked; Shepherd treats that as stale/updated and does not escalate. A newer enqueue also clears it. The raw removal fields still render in the merge-queue header on every tick regardless of this check; and
- no earlier actionable-work branch supplied a concrete fix.

Failing queue CI is actionable and therefore stays `FIX_CODE`; it does not trigger `merge-queue-removed`. The escalation preserves GitHub's raw removal reason, actor, timestamp, queue commit, and parent OIDs when available.

### Native-stack merge routing

Native-stack membership is not an escalation. When a one-PR `--merge` poll reaches its ready delay, it writes the layer's READY receipt and returns non-terminal `FIX_CODE` with `pr-shepherd --stack <PR URL> --until-terminal --merge`. This applies at every position, including position 1: `--auto` is rejected server-side on stacked PRs, and a plain `gh pr merge` fallback would land a mid-stack layer into its still-unmerged parent rather than the stack trunk.

The aggregate selector reconciles every open layer's READY receipt and linear ancestry, then returns stack-level `SHEPHERD` for every layer that still has work, `WAIT` when every remaining layer can only wait or the stack is queued, `MERGE` with `gh stack merge` for the highest ready prefix when `--merge` is set, `CANCEL` once every open layer is READY without `--merge` or after every layer merges, and `ESCALATE` only for a genuine human decision after autonomous sessions are exhausted. It never performs a mutation.

For aggregate `--stack` polling, a clean draft is marked ready by its own session without waiting for lower layers. Closed or unverified topology is surfaced during `SHEPHERD` when another layer can still proceed; otherwise it returns `ESCALATE` for human direction. If `--stack --merge` finds a ready prefix whose bottom open layer targets the stack base, it returns `MERGE` with `GH_REPO=<owner/repo> gh stack merge <PR number> --yes --squash` for that highest ready layer; rerun the same selector until every layer merges and it returns `CANCEL`.

**Detection caveat:** GitHub's stack field is a public-preview API and can be absent even for a genuinely stacked PR — for example when Stacked PRs are disabled on the repository. An absent `stack` field is therefore not proof the PR isn't stacked; it only means Shepherd has no signal either way. Shepherd has no other reliable signal to distinguish an ordinary feature branch from an undetectable stacked PR (comparing the base branch to the repository's default branch false-positives on any PR that targets a non-default branch for ordinary reasons), so it does not attempt to infer stackedness beyond this field. This is a known gap, not a silently accepted risk: absence of the field only means the ordinary merge path proceeds, it does not confirm the PR is safe to merge with a plain `gh pr merge --auto`.

### `stall-timeout`

There are two paths:

- CI-start path: the timeout is enabled, the prospective result is `WAIT`, and an external status context—or a `PENDING`, `QUEUED`, `REQUESTED`, or `WAITING` check run with no start time—remains unstarted for at least the threshold.
- Stable-state path: the timeout is enabled, the prospective result is `WAIT` or `FIX_CODE`, the stored fingerprint is unchanged, its age is nonnegative, and that age reaches the threshold. The fingerprint covers the action, the PR head commit GitHub reports (not the local checkout's `HEAD`), PR/merge/draft state, failing and in-progress checks, actionable item IDs, and actionable annotations.

A changed fingerprint resets the timer. Disabling the timeout refreshes state and never escalates. A native-stack draft whose wait is the disabled mark-ready hold uses this same guard.

A `--stack` selection has a third path. When every remaining layer's bounded probe can only report waiting ([the idle `WAIT`](actions.md#shepherd-actions)), no one-PR session runs, so the selector keeps its own timer in `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/stack-<number>/stack-stall.json`. It fingerprints the summary status plus each layer's head commit, draft state, READY receipt, reasons. Every aggregate tick shares that timer, whether it comes from `--until-terminal`, a bounded poll, or MCP. A changed fingerprint resets it, and any other stack plan or a disabled timeout clears it. Once an unchanged idle `WAIT` reaches the threshold, the selector returns `ESCALATE` with a `stall-timeout` instruction that names each waiting layer and why it waits.

### `required-checks-unreported`

The merge target requires one or more status contexts that have no check run and no status context on the head, no relevant Actions workflow is running, and Shepherd already emitted one close/reopen for that same head and context set. The marker is `ci-retrigger.json` under the PR state directory. A second close will not create a job the workflow does not emit. Path filters are the usual cause.

This is immediate. It does not wait for `stall-timeout`. A behind trunk or a `BEHIND` merge status stays on `FIX_CODE` (rebase, then push) and does not write the marker, so a repeated rebase still uses the ordinary stall timer. Failing checks, merge conflicts, and an in-progress Actions workflow do not take this trigger. Other autonomous review work on the same tick stays `FIX_CODE` without a second close; the trigger fires once that work is gone and the contexts are still missing.

### `stall-state-unavailable`

The stall timeout is enabled, and the one-PR timer (`iterate-stall.json`) or the stack timer (`stack-stall.json`) cannot be read or written. A missing file is a normal first sighting. `ENOENT` is that miss. Any other read error, an unsafe state key, or a failed write of a new or reset timer is this trigger. Corrupt JSON is a miss, so one successful rewrite starts the timer again.

The escalation suggestion quotes the filesystem error and tells the caller to fix `PR_SHEPHERD_STATE_DIR` or the directory permissions, then resume. `--stall-timeout 0` does not use this trigger: the guard is off, and the original action stands. A `--stack` selection returns the same handoff as one instruction, `` `stall-state-unavailable` ``, naming the error. Disabling the timeout, or switching to a plan that is not an idle wait, still clears the timer on a best-effort basis.

## Non-escalating outcomes

- `FIX_CODE` is always non-terminal: perform the emitted work and iterate immediately.
- Stack-level `SHEPHERD` is always non-terminal: complete the listed one-PR sessions and reselect
  the stack before any remaining human handoff.
- Closed or merged PRs return `CANCEL`, not `ESCALATE`.
- Ordinary non-force pushes do not produce `authorization-required`.
- Missing-location threads and unauthorized review mutations are surfaced/logged once and skipped.
- Failing queue CI and URL-backed external checks remain actionable `FIX_CODE` work.
