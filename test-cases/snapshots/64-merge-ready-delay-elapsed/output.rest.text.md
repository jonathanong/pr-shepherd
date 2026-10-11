# PR #42 [MERGE]

**status** `READY` · **repo** `owner/repo`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Merge command

- REST merge: `pr-shepherd apply merge https://github.com/owner/repo/pull/42 --require-sha abc123 --merge-action default --transport rest`

## Instructions

1. Run the `REST merge` command shown above exactly as printed. If its status is `pending`, rerun that same command at the configured polling cadence to resume the recorded request; `enqueued` is not merged.
2. Then iterate with the same options until GitHub confirms the PR merged or needs work.
