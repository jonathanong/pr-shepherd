# PR #42 [MERGE]

**status** `READY`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
**nextCheck** `2024-05-15T19:12:00Z` · in 320s · reason `merge-pending`

## Instructions

1. Run the REST merge command exactly as printed: `pr-shepherd apply merge https://github.com/owner/repo/pull/42 --require-sha abc123 --merge-action default --transport rest`. `enqueued` is not merged.
2. End this turn now without sleeping or polling. Playbook: "Event loop".
3. Keep exactly one wake-up at `2024-05-15T19:12:00Z` (`merge-pending`). When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload.
