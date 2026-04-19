# shepherd iterate — step-by-step flow

[← README.md](README.md) | [actions.md](actions.md)

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

### 4. Actionable work

**Check:** any of:

- `report.threads.actionable.length > 0`
- `report.comments.actionable.length > 0`
- `report.changesRequestedReviews.length > 0`
- `report.checks.failing` has any entry with `failureKind === 'actionable'`
- `report.mergeStatus.status === 'CONFLICTS'`

CONFLICTS is included here because the `fix_code` handler already runs `git fetch origin && git rebase origin/<BASE_BRANCH> && git push --force-with-lease`, so merge conflicts and review comments are resolved together in a single push rather than across two separate ticks.

**Side-effects:** cancels stale CI runs (`gh run cancel <runId>`) for actionable check failures.

**Emits:** `action: 'fix_code'` with the full `fix` payload (may have empty threads/checks when CONFLICTS-only).

---

### 5. Transient failures

**Check:** any failing check has `failureKind === 'timeout'` or `failureKind === 'infrastructure'`, and no actionable work, no conflicts.

**Side-effects:** `gh run rerun <runId> --failed` for each unique run ID.

**Emits:** `action: 'rerun_ci'`

---

### 6. Flaky + behind

**Check:** any failing check has `failureKind === 'flaky'` AND `report.mergeStatus.status === 'BEHIND'`.

**Why:** A flaky test is more likely to pass after a rebase onto main.

**Emits:** `action: 'rebase'`

---

### 7. Mark ready

**Check:** `report.status === 'READY'` AND `mergeStateStatus` is `CLEAN` (or `DRAFT` when `isDraft`) AND `!copilotReviewInProgress` AND `isDraft` AND `!shouldCancel`.

**Side-effects:** `gh pr ready <PR>`

**Emits:** `action: 'mark_ready'`

---

### 8. Wait

**Fallthrough:** nothing actionable, no terminal state, no ready-delay elapsed.

**Emits:** `action: 'wait'`

---

## Decision table

| Step    | Condition                                   | Action       | Exit code |
| ------- | ------------------------------------------- | ------------ | --------- |
| 1       | Last commit < cooldownSeconds old           | `cooldown`   | 0         |
| 2.5     | `state !== 'OPEN'`                          | `cancel`     | 2         |
| 3 cont. | `shouldCancel`                              | `cancel`     | 2         |
| 4       | Actionable threads/comments/CI or CONFLICTS | `fix_code`   | 1         |
| 5       | Transient CI failures                       | `rerun_ci`   | 0         |
| 6       | Flaky + BEHIND                              | `rebase`     | 1         |
| 7       | READY + CLEAN + isDraft                     | `mark_ready` | 0         |
| 8       | Fallthrough                                 | `wait`       | 0         |
