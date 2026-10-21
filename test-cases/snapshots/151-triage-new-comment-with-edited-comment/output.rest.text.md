# PR #42 [TRIAGE]

**status** `UNRESOLVED_COMMENTS`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Actionable comments

### [commentId=IC_new](https://github.com/owner/repo/pull/42#issuecomment-4) (@reviewer)

> Please add a regression test for the empty-list case.

## Edited comments (1) — informational; edits do not block readiness

### [commentId=IC_bot_summary](https://github.com/owner/repo/pull/42#issuecomment-2) (@coderabbitai · Bot) [edited since first look]

> <!-- walkthrough -->
> Walkthrough updated after the latest PR description edit.

## Instructions

1. Fix each warranted item.
2. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <reason>'`.
3. Commit and push any changes.
4. Rerun Shepherd now.
