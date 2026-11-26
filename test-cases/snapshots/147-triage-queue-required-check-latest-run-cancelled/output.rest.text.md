# PR #42 [WAIT]

**status** `READY` · **repo** `owner/repo`
**summary** 1 passing · **remainingSeconds** 600
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Required status checks: web [Required]
Merge queue: Unknown [Required]
**nextCheck** `2024-05-15T19:57:00Z` · in 3020s · reason `safety-net`

WAIT: 1 passing

## Instructions

1. Non-terminal — no action needed this tick.
2. End this turn now without sleeping or polling. Playbook: "Event loop".
3. Keep exactly one safety-net wake-up at `2024-05-15T19:57:00Z` (`safety-net`). When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload.
