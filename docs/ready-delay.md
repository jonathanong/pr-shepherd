# shepherd ready-delay

[← README](../README.md)

## What it does

The ready-delay prevents shepherd from cancelling the loop the instant CI goes green. It waits for a configurable window of consecutive READY status before emitting `action: cancel`. This gives reviewers time to post comments before the loop exits.

The timer also starts when the PR is BLOCKED but shepherd has nothing left to do — all CI is green, no unresolved threads or comments, no Copilot review pending. This covers any branch-protection reason: awaiting a first human review (`REVIEW_REQUIRED`), awaiting additional approvals (`APPROVED` but not enough), required signed commits, or other policy. From shepherd's perspective these are all hand-off states — it cannot resolve them — so the ready-delay countdown applies and the loop cancels once it elapses.

## The `updateReadyDelay` function

Located in `commands/ready-delay.mts`, called from `iterate.mts` (step 3).

```
updateReadyDelay(pr, isReady, readyDelaySeconds, owner, repo)
  → { isReady, shouldCancel, remainingSeconds }
```

## Marker file

**Path:** `$TMPDIR/pr-shepherd-state/<owner>-<repo>/<pr>/ready-since.txt`

**Format:** Unix timestamp in seconds (plain integer string).

## Lifecycle

| Event                                       | Effect on `ready-since.txt`                                 |
| ------------------------------------------- | ----------------------------------------------------------- |
| First READY sweep                           | Created with current timestamp                              |
| Subsequent READY sweeps (delay not elapsed) | Read; `remainingSeconds` decremented                        |
| READY sweep, delay elapsed                  | Read; `shouldCancel: true` returned; file **left in place** |
| Non-READY sweep                             | Deleted (countdown resets)                                  |
| PR merged/closed (step 2.5)                 | Not reached — `updateReadyDelay` is skipped entirely        |

The file is **left in place** when `shouldCancel: true` fires. This prevents the countdown from restarting if the loop somehow continues after the cancel (e.g., a race condition between overlapping dynamic ticks).

## Clock-skew guard

If the timestamp in `ready-since.txt` is in the future (e.g., due to a system clock jump), shepherd resets it to the current time. This prevents the delay from skipping entirely on the next tick.

## Configuration

| Parameter            | Default                     | How to change                         |
| -------------------- | --------------------------- | ------------------------------------- |
| `readyDelaySeconds`  | 600 (10 minutes)            | `--ready-delay 10m` flag on `iterate` |
| Base state directory | `$TMPDIR/pr-shepherd-state` | `PR_SHEPHERD_STATE_DIR` env var       |
