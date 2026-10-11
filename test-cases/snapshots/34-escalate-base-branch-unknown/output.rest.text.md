# PR #42 [ESCALATE]

**status** `UNRESOLVED_COMMENTS` · **repo** `owner/repo`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `base-branch-unknown`

Could not determine the PR's base branch (GraphQL batch returned an empty base branch name) — automated rebases are paused because branch safety is unclear. Run the rebase manually against the PR's real target branch.

## Items needing attention

- thread `rest-thread-30` — `src/main.ts:1` (@reviewer · User):

  - comment `PRRC_30` (@reviewer · User):

    > Please fix the import order.


## Pending review commands

- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-30 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha HEAD`

---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42` to resume.

## Instructions

1. Stop polling. Ask the user whether to run the pending review commands shown above.
2. If yes, set any `$DISMISS_MESSAGE` to a one-sentence disposition, run every pending command from the pushed PR head, then rerun Shepherd with the same options.
