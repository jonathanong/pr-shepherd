# shepherd ready-delay

[← README.md](README.md)

## What it does

The ready-delay prevents shepherd from cancelling the loop the instant CI goes green. It waits for a configurable window of consecutive READY status before emitting `action: cancel`. This gives reviewers time to post comments before the loop exits.

## The `updateReadyDelay` function

Located in `commands/ready-delay.mts`, called from `iterate.mts` (step 3).

```
updateReadyDelay(pr, isReady, readyDelaySeconds, owner, repo)
  → { isReady, shouldCancel, remainingSeconds }
```

## Marker file

**Path:** `$TMPDIR/pr-shepherd-cache/<owner>-<repo>/<pr>/ready-since.txt`

**Format:** Unix timestamp in seconds (plain integer string).

## Lifecycle

| Event                                       | Effect on `ready-since.txt`                                 |
| ------------------------------------------- | ----------------------------------------------------------- |
| First READY sweep                           | Created with current timestamp                              |
| Subsequent READY sweeps (delay not elapsed) | Read; `remainingSeconds` decremented                        |
| READY sweep, delay elapsed                  | Read; `shouldCancel: true` returned; file **left in place** |
| Non-READY sweep                             | Deleted (countdown resets)                                  |
| PR merged/closed (step 2.5)                 | Not reached — `updateReadyDelay` is skipped entirely        |

The file is **left in place** when `shouldCancel: true` fires. This prevents the countdown from restarting if the loop somehow continues after the cancel (e.g., a race condition between cron ticks).

## Clock-skew guard

If the timestamp in `ready-since.txt` is in the future (e.g., due to a system clock jump), shepherd resets it to the current time. This prevents the delay from skipping entirely on the next tick.

## Configuration

| Parameter            | Default                  | How to change                         |
| -------------------- | ------------------------ | ------------------------------------- |
| `readyDelaySeconds`  | 600 (10 minutes)         | `--ready-delay 10m` flag on `iterate` |
| Base cache directory | `$TMPDIR/pr-shepherd-cache` | `PR_SHEPHERD_CACHE_DIR` env var          |
