# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Changes-requested reviews

### `reviewId=PRR_prlevel` (@architect · User)

> The overall architecture needs to be reconsidered before merging.

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Changes-requested reviews` and decide whether it needs a code change.
2. Read every body under `## Changes-requested reviews` and apply any warranted change.
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`. Playbook: "Shepherd Journal".
5. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
