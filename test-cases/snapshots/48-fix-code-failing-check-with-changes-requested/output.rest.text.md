# PR #42 [FIX_CODE]

**status** `FAILING`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Failing checks

- `4801` — `CI › tests` [conclusion: FAILURE]
  > Run tests
  rerun: `gh run rerun 4801 -R owner/repo`

## Changes-requested reviews

### `reviewId=PRR_cr_with_check` (@reviewer)

> The failing test points at a real bug — please fix the off-by-one in the loop.

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
5. Rerun this command now.
