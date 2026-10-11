# PR #42 [FIX_CODE]

**status** `FAILING`
**summary** 1 passing, 1 superseded
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
**superseded** `CI / build`

## Failing checks

- `701` — `Integration › Integration / tests` [conclusion: FAILURE]
  rerun: `gh run rerun 701 -R owner/repo`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
5. Rerun Shepherd now.
