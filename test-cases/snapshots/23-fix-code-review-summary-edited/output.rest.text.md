# PR #42 [FIX_CODE]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing · **remainingSeconds** 600
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Review summaries (edited since first look — already minimized; do not re-minimize)

### `reviewId=PRR_edit` (@reviewer · User)

> Updated review: looks better now, just a few minor issues remain.

## Post-fix actions

- base: `main`

## Instructions

1. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
2. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`. Playbook: "Shepherd Journal".
3. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
