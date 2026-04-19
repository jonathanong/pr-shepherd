# shepherd actions

[← README.md](README.md)

Each iteration of `shepherd iterate` returns exactly one action. The cron prompt reads the JSON and acts on it inline.

---

## `cooldown`

**Trigger condition:** `nowSeconds − lastCommitTime < cooldownSeconds` (default 30s). No check has been run.

**Side-effects:** None. Returns immediately without calling GitHub.

**Cron logs:** `SKIP: CI still starting`

**Next step:** Loop continues on next cron tick.

---

## `wait`

**Trigger condition:** Fallthrough — no actionable work, no terminal state, no ready-delay elapsed, no draft to mark ready.

**Side-effects:** None.

**Cron logs:** `WAIT: <summary.passing> passing, <summary.inProgress> in-progress (merge state: <mergeStateStatus>, <remainingSeconds>s cooldown remaining)`

**Next step:** Loop continues on next cron tick.

---

## `cancel`

**Trigger condition:** One of:

1. Ready-delay elapsed — `readyState.shouldCancel` is true after `readyDelaySeconds` of consecutive READY status.
2. PR merged or closed — `report.mergeStatus.state !== 'OPEN'` (fired in step 2.5 before ready-delay check).

**Side-effects:** None. The file `ready-since.txt` is left in place (prevents countdown restart if loop somehow continues).

**Next step:** Cron invokes `/loop cancel` which stops the cron loop. See `.claude/commands/shepherd.md`.

---

## `fix_code`

**Trigger condition:** Any of:

- `report.threads.actionable.length > 0` (unresolved inline review threads)
- `report.comments.actionable.length > 0` (visible PR-level comments)
- `report.changesRequestedReviews.length > 0` (reviewer requested changes)
- Any failing CI check with `failureKind === 'actionable'`

**Side-effects:** `gh run cancel <runId>` for each unique run ID of actionable CI failures (best-effort; errors are swallowed).

The `fix` object contains:

- `threads` — actionable review threads
- `comments` — actionable PR comments
- `checks` — actionable failing CI checks (with log excerpts)
- `changesRequestedReviews` — CHANGES_REQUESTED reviews

**Next step:** Cron reads the `fix` payload and performs the full repair sequence: cancel stale CI → fix code → commit → rebase → push → resolve threads.

---

## `rerun_ci`

**Trigger condition:** Any failing check has `failureKind === 'timeout'` or `failureKind === 'infrastructure'`, and no actionable work was found (step 5 runs only after step 4 yields no action).

**Side-effects:** `gh run rerun <runId> --failed` for each unique run ID. Multiple checks sharing the same run ID are deduplicated.

**Cron logs:** `RERAN <N> CI checks: <runId1> <runId2> ...`

**Next step:** Loop continues; CI will be re-queued.

---

## `rebase`

**Trigger condition:** Any failing check has `failureKind === 'flaky'` AND `report.mergeStatus.status === 'BEHIND'`. Also fires when `mergeStatus.status === 'CONFLICTS'` (step 4) — in that case the conflict must be resolved before any other work can proceed.

**Side-effects:** None from iterate.

**Next step:** Cron runs `git fetch origin && git rebase origin/<BASE_BRANCH> && git push --force-with-lease`.

---

## `mark_ready`

**Trigger condition:** All of:

- `report.status === 'READY'`
- `mergeStateStatus === 'CLEAN'` (or `'DRAFT'` when `isDraft`)
- `!report.mergeStatus.copilotReviewInProgress`
- `!readyState.shouldCancel`
- `report.mergeStatus.isDraft === true`

**Side-effects:** `gh pr ready <PR>` — converts the draft PR to ready for review.

**Cron logs:** `MARKED READY: PR <pr>`

**Next step:** Loop continues; PR is now visible to reviewers.
