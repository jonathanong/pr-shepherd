# PR #42 [READY]

**status** `READY` · **merge** `BLOCKED` · **repo** `owner/repo`
**summary** 1 passing · **remainingSeconds** 300
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Required]
**nextCheck** `2024-05-15T19:12:00Z` · in 320s · reason `ready-delay`

READY: PR #42 is ready — 300s of ready-delay remaining — 1 passing — awaiting 1 approval

## Instructions

1. PR #42 is ready. Ready-delay has 300s left. Do not invent unrelated work.
2. End this turn now without sleeping or polling. Playbook: "Event loop".
3. Keep exactly one wake-up at `2024-05-15T19:12:00Z` (`ready-delay`). When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload.
