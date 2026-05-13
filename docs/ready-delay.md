# shepherd ready-delay

[← README](../README.md)

## What it does

The ready-delay prevents shepherd from cancelling the loop the instant CI goes green. It waits for a configurable window of consecutive clean handoff status before emitting `action: cancel`. A clean handoff means the current sweep is `READY` and has no actionable Shepherd work such as failing CI, conflicts, unresolved comments, review-summary minimization, or first-look items. This gives reviewers time to post comments before the loop exits without letting stale readiness survive a newly unclean PR.

The timer also starts when the PR is BLOCKED but shepherd has nothing left to do — all CI is green, no unresolved threads or comments, no Copilot review pending. This covers any branch-protection reason: awaiting a first human review (`REVIEW_REQUIRED`), awaiting additional approvals (`APPROVED` but not enough), required signed commits, or other policy. From shepherd's perspective these are all hand-off states — it cannot resolve them — so the ready-delay countdown applies and the loop cancels once it elapses.

Before the timer starts or completes, Shepherd refreshes mergeability through GitHub's REST pull-request endpoint unless the current sweep already used that fallback for an UNKNOWN mergeability response. If the refresh reports conflicts, the PR drops out of READY, the timer resets, and iterate emits `fix_code`.

## The `updateReadyDelay` function

Located in `commands/ready-delay.mts`, called from `commands/iterate/index.mts` (step 3).

```
updateReadyDelay(pr, isReady, readyDelaySeconds, owner, repo)
  → { isReady, shouldCancel, remainingSeconds }
```

`isReady` is `true` only after iterate confirms the sweep is a clean handoff. A top-level `READY` report with actionable work still passes `false` so the marker resets before `fix_code` is emitted.

## Marker file

**Path:** `$TMPDIR/pr-shepherd-state/<owner>-<repo>/<pr>/ready-since.txt`

**Format:** Unix timestamp in seconds (plain integer string).

## Lifecycle

| Event                                                | Effect on `ready-since.txt`                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| First clean handoff sweep                            | Created with current timestamp                                                                          |
| Subsequent clean handoff sweeps (delay not elapsed)  | Read; `remainingSeconds` decremented                                                                    |
| Clean handoff sweep, delay elapsed                   | Read; `shouldCancel: true` returned; existing `updateReadyDelay` code deletes the file before returning |
| Non-READY sweep, or READY sweep with actionable work | Deleted (countdown resets)                                                                              |
| PR merged/closed (step 1.5)                          | Deleted before iterate returns `cancel`                                                                 |

## Clock-skew guard

If the timestamp in `ready-since.txt` is in the future (e.g., due to a system clock jump), shepherd resets it to the current time. This prevents the delay from skipping entirely on the next tick.

## Configuration

| Parameter            | Default                     | How to change                         |
| -------------------- | --------------------------- | ------------------------------------- |
| `readyDelaySeconds`  | 600 (10 minutes)            | `--ready-delay 10m` flag on `iterate` |
| Base state directory | `$TMPDIR/pr-shepherd-state` | `PR_SHEPHERD_STATE_DIR` env var       |
