# shepherd iterate — step-by-step flow

[← README](../README.md) | [actions.md](actions.md)

`commands/iterate.mts` is the heart of the watch loop. Each cron tick calls it once and interprets the JSON result.

## Steps

### 1. Cooldown

**Check:** `getLastCommitTime()` reads `git log -1 --format=%ct HEAD`. If the commit is less than `cooldownSeconds` (default 30) old, return immediately.

**Why:** CI hasn't started yet for very recent pushes. Polling immediately wastes API calls and produces noise.

**Emits:** `action: 'cooldown'`

---

### 2. Sweep

**What:** `runCheck({ autoResolve: true })` fires one GraphQL batch query (CI checks + review threads + PR comments + merge state). Also auto-resolves any threads GitHub has marked `isOutdated`.

**Why:** Auto-resolving outdated threads here means the main agent doesn't have to manually call `resolve` after every push.

---

### 2.5. Terminal state — PR merged or closed

**Check:** `report.mergeStatus.state !== 'OPEN'`

**Why:** GitHub returns `mergeable: UNKNOWN` and `mergeStateStatus: UNKNOWN` for merged/closed PRs. Without this branch the loop falls through to `action: wait` and polls forever.

**Emits:** `action: 'cancel'` — skips ready-delay, skips all actionable checks.

---

### 3. Ready-delay state machine

**What:** `updateReadyDelay(pr, isReady, readyDelaySeconds, owner, repo)` reads/writes `ready-since.txt`.

- On first READY sweep: creates the file with the current timestamp.
- On subsequent READY sweeps: checks if `now − readySince >= readyDelaySeconds`. If so, `shouldCancel: true`.
- On non-READY sweep: deletes the file (resets the countdown).

See [ready-delay.md](ready-delay.md) for full lifecycle.

---

### 3 (cont.). Cancel (ready-delay elapsed)

**Check:** `readyState.shouldCancel`

**Emits:** `action: 'cancel'`

---

### 3.5. Stall guard

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

**Applies to:** `wait`, `fix_code`. Not applied to `cooldown`, `cancel`, `mark_ready`, or `escalate` — these are either pre-sweep, already terminal, or one-shot.

---

### 4. Actionable work

**Check:** any of:

- `report.threads.actionable.length > 0`
- `report.comments.actionable.length > 0`
- `report.changesRequestedReviews.length > 0`
- `report.checks.failing.length > 0` (any failing check, regardless of conclusion)
- `report.mergeStatus.status === 'CONFLICTS'`

All failing checks — including timeout, cancelled, and flaky failures — route here. The `fix` payload carries `conclusion` for each failing check; `workflowName`, `jobName`, and `failedStep` are populated only when triage runs (that is, for non-cancelled checks). The agent runs `gh run view <runId> --log-failed` to fetch the full log when needed and decides whether to rerun (transient failure) or apply a code fix (real failure). Cancelled checks carry a `[conclusion: CANCELLED]` tag — the agent reruns with `gh run rerun <runId>` (no `--failed`) if the cancellation looks unintended.

CONFLICTS is included here because the `fix_code` handler already runs `git fetch origin && git rebase origin/<BASE_BRANCH> && git push --force-with-lease`, so merge conflicts and review comments are resolved together in a single push rather than across two separate ticks.

**Side-effects:** cancels stale CI runs (`gh run cancel <runId>`) for all failing checks.

**Emits:** `action: 'fix_code'` with the full `fix` payload (may have empty threads/checks when CONFLICTS-only).

---

### 5. Mark ready

**Check:** `report.status === 'READY'` AND `mergeStateStatus` is `CLEAN` (or `DRAFT` when `isDraft`) AND `!copilotReviewInProgress` AND `isDraft` AND `!shouldCancel`.

**Side-effects:** `gh pr ready <PR>`

**Emits:** `action: 'mark_ready'`

---

### 6. Wait

**Fallthrough:** nothing actionable, no terminal state, no ready-delay elapsed.

**Emits:** `action: 'wait'`

---

## Decision table

| Step    | Condition                                               | Action       | Exit code |
| ------- | ------------------------------------------------------- | ------------ | --------- |
| 1       | Last commit < cooldownSeconds old                       | `cooldown`   | 0         |
| 2.5     | `state !== 'OPEN'`                                      | `cancel`     | 2         |
| 3 cont. | `shouldCancel`                                          | `cancel`     | 2         |
| 3.5     | Same fingerprint for ≥ `stallTimeoutMinutes` (any step) | `escalate`   | 3         |
| 4       | Actionable threads/comments/any failing CI or CONFLICTS | `fix_code`   | 1         |
| 4 esc.  | Same thread hit `fixAttemptsPerThread` times            | `escalate`   | 3         |
| 5       | READY + CLEAN + isDraft                                 | `mark_ready` | 0         |
| 6       | Fallthrough                                             | `wait`       | 0         |
