# PR #42 [WAIT]

**status** `READY` · **repo** `owner/repo`
**summary** 1 passing · **remainingSeconds** 600
Merge queue: position 2 QUEUED [Not Required]
**merge queue** enabled `false` · inQueue `true` · state `QUEUED` · position `2` · headCommit `queue-head-1` · checkCommit `queue-head-1`
**nextCheck** `2024-05-15T19:12:00Z` · in 320s · reason `merge-queue`

WAIT: PR #42 is in the merge queue

## Instructions

1. Non-terminal — no action needed this tick.
2. End this turn now without sleeping or polling. Playbook: "Event loop".
3. Keep exactly one wake-up at `2024-05-15T19:12:00Z` (`merge-queue`). When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload.
