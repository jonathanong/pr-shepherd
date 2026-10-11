# PR #42 [FIX_CODE]

**status** `FAILING`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-54](https://github.com/owner/repo/pull/42#discussion_r54) — `src/index.ts:30` (@reviewer)

#### [commentId=PRRC_54](https://github.com/owner/repo/pull/42#discussion_r54) (@reviewer)

> Extract this into a helper.

## Actionable comments

### [commentId=IC_multi](https://github.com/owner/repo/pull/42#issuecomment-54) (@reviewer)

> Mention the new flag in the README.

## Failing checks

- `5401` — `CI › tests` [conclusion: FAILURE]
  > Run tests
  rerun: `gh run rerun 5401 -R owner/repo`

## Changes-requested reviews

### `reviewId=PRR_multi_cr` (@reviewer)

> Blocking until the failing test and the inline notes are addressed.

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
5. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-54 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha HEAD`
6. Rerun Shepherd now.
