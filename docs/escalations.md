# Escalation boundary

`ESCALATE` is the only Shepherd action that hands the pull request to a human. The trigger type is a closed union with exactly seven values. If none of the seven conditions below is true, Shepherd must not return `ESCALATE`.

| Trigger                       | Exact condition                                                                                                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authorization-required`      | Shepherd is about to mark a draft ready and `viewerCanUpdate !== true`, or merge/enqueue mode reached its execution point and `viewerCanEnableAutoMerge !== true`. These operations are explicit user-requested state changes that the current viewer cannot perform. |
| `check-follow-up-unavailable` | At least one remaining failing check has no autonomous follow-up, and no other autonomous work remains in the tick.                                                                                                                                                   |
| `fix-thrash`                  | A retryable, located review thread reaches `iterate.fixAttemptsPerThread` attempts across distinct pushed HEADs while its body remains unchanged.                                                                                                                     |
| `bot-cr-not-dismissed`        | An authorized bot/non-human `CHANGES_REQUESTED` dismissal was emitted, but the same review body remains undismissed for at least the enabled stall timeout.                                                                                                           |
| `base-branch-unknown`         | The GraphQL base branch is empty or unsafe and the current tick has work that could require a push, so Shepherd cannot name a safe rebase target.                                                                                                                     |
| `merge-queue-removed`         | Merge mode is enabled, GitHub reports a queue removal, the head has not changed since removal, no queue/auto-merge state remains, and no earlier branch found an actionable failure or concrete fix.                                                                  |
| `stall-timeout`               | An enabled timeout expires for CI that never starts or for an unchanged `WAIT`/`FIX_CODE` state fingerprint.                                                                                                                                                          |

## Complete predicates

### `authorization-required`

This trigger has only two operation families:

1. Mark ready: automatic mark-ready was selected for an otherwise-ready draft PR, but `viewerCanUpdate !== true`.
2. Merge or enqueue: merge mode is enabled, the ready delay elapsed, the PR is not a draft, but `viewerCanEnableAutoMerge !== true`.

Denied or unverifiable review replies, thread resolutions, and bot-review dismissals do not escalate. Shepherd surfaces the affected item once, omits the unauthorized mutation, records that first-look output in its normal debug log, and suppresses the unchanged item on later ticks. It re-surfaces only if the body changes. These skipped items are excluded from fix-attempt and stall accounting. Push access is also not an escalation trigger; it is a precondition for using Shepherd on the PR.

### `check-follow-up-unavailable`

At least one remaining failing check has no `rerunCommand` and is one of:

- `ACTION_REQUIRED`, `CANCELLED`, or `STARTUP_FAILURE`;
- a check with `runId === null` and an empty or whitespace-only `detailsUrl`; or
- a check with a non-null run ID but no nonblank included `logExcerpt`.

The trigger fires only when no autonomous work or newly surfaced one-look item remains: no conflicts, currently surfaced actionable or resolution-only threads, actionable comments, pending comment minimizations, actionable changes-requested reviews, queued/first-look/edited review summaries, first-look threads/comments, actionable annotations, or another failing check with an autonomous path. An unauthorized or unlocated review item can therefore postpone this escalation for its one visibility tick; after its seen marker suppresses it, the manual-only check may escalate on the next tick.

A failing external check with `runId === null` and a non-empty `detailsUrl` stays `FIX_CODE`. Codecov is the regression case: its URL is an autonomous investigation path even without a GitHub Actions run ID.

### `fix-thrash`

The thread must be retryable: it has a non-null path and line and every required review mutation is authorized. Attempts advance across distinct pushed HEADs while the thread body hash is unchanged. Editing the body resets that thread's attempt count.

Threads without a source location do not escalate. Shepherd surfaces and logs them once, then suppresses the unchanged item. Threads whose required reply or resolution is unauthorized follow the same skip path. Neither category contributes to `fix-thrash`.

### `bot-cr-not-dismissed`

All of the following are true:

- the current review is bot/non-human `CHANGES_REQUESTED`;
- `viewerCanAdminister === true`, so Shepherd emitted an authorized `--dismiss-review-ids` mutation;
- the current body hash matches the stored observation;
- `stallTimeoutSeconds > 0`; and
- the unchanged age reaches the configured stall timeout.

A new review ID or edited body starts a fresh timer. A successful dismissal removes the tracked entry. If dismissal is unauthorized or unverifiable, Shepherd surfaces the review once and skips it; that review cannot trigger `bot-cr-not-dismissed`.

### `base-branch-unknown`

The GraphQL base branch is empty or contains characters outside `[A-Za-z0-9._/-]`, and a push is plausible because the tick contains a retryable actionable or resolution-only thread, failing check, actionable annotation, conflict, actionable changes-requested review, or actionable comment. Skipped review mutations and unlocated threads do not make a push plausible.

### `merge-queue-removed`

All of the following are true:

- merge mode is enabled;
- no queue or auto-merge state is active;
- GitHub reports a latest merge-queue removal;
- the PR head was not updated after that removal; and
- no earlier actionable-work branch supplied a concrete fix.

Failing queue CI is actionable and therefore stays `FIX_CODE`; it does not trigger `merge-queue-removed`. The escalation preserves GitHub's raw removal reason, actor, timestamp, queue commit, and parent OIDs when available.

### `stall-timeout`

There are two paths:

- CI-start path: the timeout is enabled, the prospective result is `WAIT`, and an external status context—or a `PENDING`, `QUEUED`, `REQUESTED`, or `WAITING` check run with no start time—remains unstarted for at least the threshold.
- Stable-state path: the timeout is enabled, the prospective result is `WAIT` or `FIX_CODE`, the stored fingerprint is unchanged, its age is nonnegative, and that age reaches the threshold. The fingerprint covers the action, HEAD, PR/merge/draft state, failing and in-progress checks, actionable item IDs, and actionable annotations.

A changed fingerprint resets the timer. Disabling the timeout refreshes state and never escalates.

## Non-escalating outcomes

- `FIX_CODE` is always non-terminal: perform the emitted work and iterate again.
- Closed or merged PRs return `CANCEL`, not `ESCALATE`.
- Ordinary non-force pushes do not produce `authorization-required`.
- Missing-location threads and unauthorized review mutations are surfaced/logged once and skipped.
- Failing queue CI and URL-backed external checks remain actionable `FIX_CODE` work.
