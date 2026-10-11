# PR #42 [FIX_CODE]

**status** `IN_PROGRESS`
**summary** 1 inProgress
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
**activity** 0 commits · 0 review rounds · active: `CI / tests`

## Review threads to resolve

- `threadId=rest-thread-10` [↗](https://github.com/owner/repo/pull/42#discussion_r10) `src/helpers.ts:12` (@reviewer) [status: outdated]
  - `commentId=PRRC_10` [↗](https://github.com/owner/repo/pull/42#discussion_r10) (@reviewer)
    > This was outdated by the latest push.

## First-look items (1) — acknowledge status before acting

- `threadId=rest-thread-10` [↗](https://github.com/owner/repo/pull/42#discussion_r10) `src/helpers.ts:12` (@reviewer) [status: outdated]

## Instructions

1. Review every item under `## First-look items` before acting.
2. Review the threads under `## Review threads to resolve` before running the generated mutations.
3. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-10 --message "$DISMISS_MESSAGE" --adopt-existing-replies`
5. Rerun this command now.
