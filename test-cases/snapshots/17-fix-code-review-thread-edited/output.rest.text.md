# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads to resolve

- `threadId=rest-thread-2` [↗](https://github.com/owner/repo/pull/42#discussion_r2) `src/util.ts:10` (@reviewer) [edited since first look] [status: outdated]
  - `commentId=PRRC_2` [↗](https://github.com/owner/repo/pull/42#discussion_r2) (@reviewer)
    > Updated feedback: this is now outdated but body has changed.

## First-look items (1) — acknowledge status before acting

- `threadId=rest-thread-2` [↗](https://github.com/owner/repo/pull/42#discussion_r2) `src/util.ts:10` (@reviewer) [status: outdated, edited]

## Instructions

1. Review every item under `## First-look items` before acting.
2. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
3. Review the threads under `## Review threads to resolve` before running the generated mutations.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
5. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-2 --message "$DISMISS_MESSAGE" --adopt-existing-replies`
6. Rerun Shepherd now.
