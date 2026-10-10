# PR #42 [FIX_CODE]

**status** `FAILING` · **repo** `owner/repo`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=PRRT_multi](https://github.com/owner/repo/pull/42#discussion_r54) — `src/index.ts:30` (@reviewer · User)

#### [commentId=PRRT_multi](https://github.com/owner/repo/pull/42#discussion_r54) (@reviewer · User)

> Extract this into a helper.

## Actionable comments

### [commentId=IC_multi](https://github.com/owner/repo/pull/42#issuecomment-54) (@reviewer · User)

> Mention the new flag in the README.

## Failing checks

- `5401` — `CI › tests` [conclusion: FAILURE] [rerun authorized]
  > Run tests
  rerun: `gh run rerun 5401 -R owner/repo`

## Changes-requested reviews

### `reviewId=PRR_multi_cr` (@reviewer · User)

> Blocking until the failing test and the inline notes are addressed.

## Instructions

1. Fix each warranted item above.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any code changes.
4. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
5. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids PRRT_multi --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha "$(git rev-parse HEAD)"`
6. `[FIX_CODE]` is non-terminal. Rerun the same command now.
