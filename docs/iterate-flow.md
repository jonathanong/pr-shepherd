# shepherd iterate — step-by-step flow

[← README](../README.md) | [actions.md](actions.md)

`commands/iterate/index.mts` is the heart of the iterate loop. Each tick calls it once and follows the `## Instructions` in the result.

## Steps

### 1. Sweep

**What:** `runCheck({ autoResolve: true })` fires one GraphQL batch query (CI checks + review threads + PR comments + merge state). If the PR is already merged or closed, it returns a terminal report immediately; otherwise it auto-resolves any threads GitHub has marked `isOutdated`.

**Why:** Auto-resolving outdated threads here means the main agent doesn't have to manually call `resolve` after every push.

---

### 1.5. Terminal state — PR merged or closed

**Check:** `report.mergeStatus.state !== 'OPEN'`

**Why:** GitHub returns `mergeable: UNKNOWN` and `mergeStateStatus: UNKNOWN` for merged/closed PRs. `runCheck` surfaces this as top-level `status: 'MERGED'` or `status: 'CLOSED'`, and this branch stops the loop before actionable checks.

**Emits:** `action: 'cancel'` — clears any stale ready-delay marker, skips all actionable checks.

---

### 2. Ready-delay state machine

**What:** `updateReadyDelay(pr, isCleanReadyHandoff, readyDelaySeconds, owner, repo)` reads/writes `ready-since.txt`.

- On first clean handoff sweep: creates the file with the current timestamp.
- On subsequent clean handoff sweeps: checks if `now − readySince >= readyDelaySeconds`. If so, `shouldCancel: true`.
- On any unclean sweep: deletes the file (resets the countdown). This includes non-READY status, failing CI, conflicts, unresolved/actionable comments, review-summary minimization, and first-look items.

Before a READY sweep reaches the ready-delay state machine, `runCheck` performs one fresh REST mergeability read unless the UNKNOWN fallback already did so. If the refreshed mergeability reports `CONFLICTING`/`DIRTY`, the sweep becomes `FAILING`/`CONFLICTS`, resets the ready-delay marker, and routes to `fix_code`.

See [ready-delay.md](ready-delay.md) for full lifecycle.

---

### 2 (cont.). Cancel (ready-delay elapsed)

**Check:** `readyState.shouldCancel`

**Emits:** `action: 'cancel'`

---

### 2.5. Stall guard

**What:** After building `base` from the sweep results, `applyStallGuard` is called for every non-terminal action (`wait`, `fix_code`). It computes a fingerprint of the material iterate inputs:

- HEAD SHA (from `git rev-parse HEAD`)
- Action about to be emitted
- `status`, `mergeStateStatus`, `state`, `isDraft`
- Sorted failing-check names + conclusions
- Sorted actionable thread/comment/review IDs
- Sorted review-summary minimize IDs

The fingerprint and a `firstSeenAt` timestamp are persisted to `$TMPDIR/pr-shepherd-state/<owner>-<repo>/<pr>/iterate-stall.json`.

- **Fingerprint matches and `now − firstSeenAt ≥ stallTimeoutSeconds`** → return `action: 'escalate'` with trigger `stall-timeout`.
- **Fingerprint matches but within threshold** → preserve `firstSeenAt`, return the original action.
- **Fingerprint differs or no stored state** → write new state with `firstSeenAt = now`, return the original action.

In-progress check **names** are included so that a long-running CI pipeline where jobs complete one by one (moving from in-progress to passing) resets the timer as progress happens. Timing-only fields (`remainingSeconds`, `inProgress` count by itself) are excluded — only the set of check names changes the fingerprint, not how many are still running.

Before the generic fingerprint check, `wait` results also inspect relevant in-progress CI checks for a start stall. Queued/requested/waiting check runs with no `startedAt`, and pending external status contexts with only `createdAt`, escalate with `stall-timeout` when their latest source activity timestamp is at least `stallTimeoutSeconds` old. For check runs, activity is `updatedAtUnix` when present and `createdAtUnix` otherwise, so requeued checks do not inherit an old creation-time timeout. Started `IN_PROGRESS` check runs are not treated as CI-start stalls.

**Applies to:** `wait`, `fix_code`. Not applied to `cancel`, `mark_ready`, or `escalate` — these are either already terminal or one-shot.

---

### 3. Actionable work

**Check:** any of:

- `report.threads.actionable.length > 0`
- `report.comments.actionable.length > 0`
- `report.changesRequestedReviews.length > 0`
- `report.checks.failing.length > 0` (any failing check, regardless of conclusion)
- `report.mergeStatus.status === 'CONFLICTS'`

All failing checks — including timeout, cancelled, startup-failure, and flaky failures — route here. The `fix` payload carries `conclusion` for each failing check; `workflowName`, `jobName`, and `failedStep` are populated only when triage runs (that is, not for cancelled or startup-failure checks). The agent runs `gh run view <runId> --log-failed` to fetch the full log when needed and decides whether to rerun (transient failure) or apply a code fix (real failure). Cancelled checks carry a `[conclusion: CANCELLED]` tag — the agent reruns with `gh run rerun <runId>` (no `--failed`) if the cancellation looks unintended. Startup failures carry a `[conclusion: STARTUP_FAILURE]` tag — the agent inspects metadata with `gh run view <runId>` and reruns with `gh run rerun <runId>` if the workflow should be attempted again.

CONFLICTS is included here because the `fix_code` handler already runs `git fetch origin && git rebase origin/<BASE_BRANCH> && git push --force-with-lease`, so merge conflicts and review comments are resolved together in a single push rather than across two separate ticks.

**Side-effects:** cancels stale CI runs (`gh run cancel <runId>`) for all failing checks.

**Emits:** `action: 'fix_code'` with the full `fix` payload (may have empty threads/checks when CONFLICTS-only).

---

### 4. Mark ready

**Check:** `report.status === 'READY'` AND `mergeStateStatus` is `CLEAN` (or `DRAFT` when `isDraft`) AND `!blockingBotReviewInProgress` AND `isDraft` AND `!shouldCancel`.

**Side-effects:** `gh pr ready <PR>`

**Emits:** `action: 'mark_ready'`

---

### 5. Wait

**Fallthrough:** nothing actionable, no terminal state, no ready-delay elapsed.

**Emits:** `action: 'wait'`

---

## Decision table

| Step    | Condition                                               | Action       | Exit code |
| ------- | ------------------------------------------------------- | ------------ | --------- |
| 1.5     | `state !== 'OPEN'`                                      | `cancel`     | 2         |
| 2 cont. | `shouldCancel`                                          | `cancel`     | 2         |
| 2.5     | Same fingerprint for ≥ `stallTimeoutMinutes` (any step) | `escalate`   | 3         |
| 3       | Actionable threads/comments/any failing CI or CONFLICTS | `fix_code`   | 1         |
| 3 esc.  | Same thread hit `fixAttemptsPerThread` times            | `escalate`   | 3         |
| 4       | READY + CLEAN + isDraft                                 | `mark_ready` | 0         |
| 5       | Fallthrough                                             | `wait`       | 0         |
