# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **repo** `owner/repo`
**summary** 1 inProgress
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
**activity** 0 commits · 0 review rounds · active: `CI / tests`

## Review threads to resolve

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r10) `src/helpers.ts:12` (@reviewer · User) [status: outdated]
  - `commentId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r10) (@reviewer · User)
    > This was outdated by the latest push.

## First-look items (1) — acknowledge status before acting

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r10) `src/helpers.ts:12` (@reviewer · User) [status: outdated]

## Instructions

1. Review every item under `## First-look items` before acting.
2. Review the threads under `## Review threads to resolve` before running the generated mutations.
3. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids PRRT_outdated --message "$DISMISS_MESSAGE" --adopt-existing-replies`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
