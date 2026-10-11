# PR #42 [FIX_CODE]

**status** `READY`
**remainingSeconds** 600
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## First-look items (1) — acknowledge status before acting

- `threadId=rest-thread-200` [↗](https://github.com/owner/repo/pull/42#discussion_r200) `src/thread-comments.ts:36` (@reviewer) [status: resolved, edited]
  - `commentId=PRRC_resolved_1` [↗](https://github.com/owner/repo/pull/42#discussion_r200) (@reviewer)
    > Original concern.
  - `commentId=PRRC_resolved_2` [↗](https://github.com/owner/repo/pull/42#discussion_r201) (@author)
    > Acknowledged, fixed in latest push.
  - `commentId=PRRC_resolved_3` [↗](https://github.com/owner/repo/pull/42#discussion_r202) (@reviewer)
    > Thanks. One follow-up: please add the missing test-case too.

## Instructions

1. Review every item under `## First-look items` before acting.
2. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
3. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Rerun Shepherd now.
