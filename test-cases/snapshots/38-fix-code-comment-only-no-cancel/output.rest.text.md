# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
**activity** 0 commits · 0 review rounds · active: `CI / build`

## Actionable comments

### [commentId=IC_comment1](https://github.com/owner/repo/pull/42#issuecomment-1) (@reviewer · User)

> Please update the README with usage examples.

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Actionable comments` and decide whether it needs a code change.
2. Apply every warranted review fix in the relevant files.
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`. Playbook: "Shepherd Journal".
5. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
