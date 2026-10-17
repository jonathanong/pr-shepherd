# PR #42 [TRIAGE]

**status** `FAILING`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Actionable comments

### [commentId=IC_with_check](https://github.com/owner/repo/pull/42#issuecomment-47) (@reviewer)

> Please also update the changelog for this change.

## Failing checks

- `4701` — `CI › lint` [conclusion: FAILURE]
  > Run oxlint
  rerun: `gh run rerun 4701 -R owner/repo`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <reason>'`.
4. Commit and push any changes.
5. Rerun Shepherd now.
