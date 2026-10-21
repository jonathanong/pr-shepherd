# PR #42 [TRIAGE]

**status** `UNRESOLVED_COMMENTS`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### `threadId=rest-thread-990000` — `src/auth.ts:10` (@reviewer)

#### `commentId=PRRC_990000` (@reviewer)

> Please fix this.

## Changes-requested reviews

### `reviewId=PRR_overlap` (@reviewer)

> Please refactor the auth module.

## Review summaries (first look)

### `reviewId=PRR_overlap` (@reviewer)

> Please refactor the auth module.

## Instructions

1. Fix each warranted item.
2. Read each body under `## Review summaries (first look)` before acting.
3. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <reason>'`.
4. Commit and push any changes.
5. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-990000 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha HEAD`
6. Rerun Shepherd now.
