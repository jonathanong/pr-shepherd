# Escalation boundary

`ESCALATE` is Shepherd's explicit human-handoff action. For a singular PR it uses the closed trigger
union below. Native-stack aggregate reconciliation remains read-only: autonomous unready layers
return `FIX_CODE`, queued stacks return `WAIT`, and terminal READY or merged stacks return `CANCEL`.
Aggregate `ESCALATE` is reserved for genuine human decisions such as closed or unverified topology.
Aggregate mode never performs a mutation; a fully READY `--stack --merge` result emits an agent-run
whole-stack merge command.

| Trigger                       | Exact condition                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authorization-required`      | Shepherd is about to automatically mark a draft ready and `viewerCanUpdate !== true`. Explicit merge/enqueue requests are attempted and surface GitHub's actual error instead.                       |
| `check-follow-up-unavailable` | At least one remaining failing check has no autonomous follow-up, and no other autonomous work remains in the tick.                                                                                  |
| `fix-thrash`                  | A retryable, located review thread remains unchanged and unresolved after appearing in `iterate.fixAttemptsPerThread` caller-visible `FIX_CODE` results; the following unchanged tick escalates.     |
| `base-branch-unknown`         | The GraphQL base branch is empty or unsafe and the current tick has work that could require a push, so Shepherd cannot name a safe rebase target.                                                    |
| `merge-queue-removed`         | Merge mode is enabled, GitHub reports a queue removal, the head has not changed since removal, no queue/auto-merge state remains, and no earlier branch found an actionable failure or concrete fix. |
| `stall-timeout`               | An enabled timeout expires for CI that never starts or for an unchanged `WAIT`/`FIX_CODE` state fingerprint.                                                                                         |

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
- the PR head was not updated after that removal, **and this is verifiable** — GitHub's `timelineItems(last: 1, ...)` keeps returning the single most recent removal event regardless of age, so a PR removed from the queue once and never re-added would otherwise re-trigger this escalation forever. When GitHub omits the removed queue commit for that event (for example after it is garbage collected), freshness cannot be checked; Shepherd treats that as stale/updated and does not escalate. The raw removal fields still render in the merge-queue header on every tick regardless of this check; and
- no earlier actionable-work branch supplied a concrete fix.

Failing queue CI is actionable and therefore stays `FIX_CODE`; it does not trigger `merge-queue-removed`. The escalation preserves GitHub's raw removal reason, actor, timestamp, queue commit, and parent OIDs when available.

### Native-stack merge routing

Native-stack membership is not an escalation. When a one-PR `--merge` poll reaches its ready delay, it writes the layer's READY receipt and returns non-terminal `FIX_CODE` with `pr-shepherd --stack <PR URL> --until-terminal --merge`. This applies at every position, including position 1: `--auto` is rejected server-side on stacked PRs, and a plain `gh pr merge` fallback would land a mid-stack layer into its still-unmerged parent rather than the stack trunk.

The aggregate selector reconciles every open layer's READY receipt and linear ancestry, then returns `FIX_CODE` for autonomous unready work, `WAIT` for a queued stack, `MERGE` with a whole-stack command when every layer is READY, `CANCEL` after every layer merges, and `ESCALATE` only for a genuine human decision. It never performs a mutation or proposes a partial-stack merge.

For aggregate `--stack` polling, an unready lower layer blocks every upper layer from becoming ready,
while independent review and CI sessions may proceed concurrently. Closed or unverified topology
returns `ESCALATE` for human direction. If `--stack --merge` finds every layer fully READY and
linear, it returns `MERGE` with `GH_REPO=<owner/repo> gh stack merge --yes --squash <stack-number>`
for the agent to run; rerun the same selector until all layers merge and it returns `CANCEL`.

**Detection caveat:** GitHub's stack field is a public-preview API and can be absent even for a genuinely stacked PR — for example when Stacked PRs are disabled on the repository. An absent `stack` field is therefore not proof the PR isn't stacked; it only means Shepherd has no signal either way. Shepherd has no other reliable signal to distinguish an ordinary feature branch from an undetectable stacked PR (comparing the base branch to the repository's default branch false-positives on any PR that targets a non-default branch for ordinary reasons), so it does not attempt to infer stackedness beyond this field. This is a known gap, not a silently accepted risk: absence of the field only means the ordinary merge path proceeds, it does not confirm the PR is safe to merge with a plain `gh pr merge --auto`.

### `stall-timeout`

There are two paths:

- CI-start path: the timeout is enabled, the prospective result is `WAIT`, and an external status context—or a `PENDING`, `QUEUED`, `REQUESTED`, or `WAITING` check run with no start time—remains unstarted for at least the threshold.
- Stable-state path: the timeout is enabled, the prospective result is `WAIT` or `FIX_CODE`, the stored fingerprint is unchanged, its age is nonnegative, and that age reaches the threshold. The fingerprint covers the action, HEAD, PR/merge/draft state, failing and in-progress checks, actionable item IDs, and actionable annotations.

A changed fingerprint resets the timer. Disabling the timeout refreshes state and never escalates.

## Non-escalating outcomes

- `FIX_CODE` is always non-terminal: perform the emitted work and iterate immediately.
- Closed or merged PRs return `CANCEL`, not `ESCALATE`.
- Ordinary non-force pushes do not produce `authorization-required`.
- Missing-location threads and unauthorized review mutations are surfaced/logged once and skipped.
- Failing queue CI and URL-backed external checks remain actionable `FIX_CODE` work.
