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

### [threadId=rest-thread-7](https://github.com/owner/repo/pull/42#discussion_r7) — `src/paginate.ts:18` (@reviewer) [edited since first look]

#### [commentId=PRRC_7](https://github.com/owner/repo/pull/42#discussion_r7) (@reviewer)

> nit: rename `n` to `pageSize`.
>
> Edit: also, this loop uses `i <= items.length`, so the last page reads one past the end and returns `undefined`. Please fix the bound and add a test for an exact multiple of `pageSize`.

## Instructions

1. Fix each warranted item.
2. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <reason>'`.
3. Commit and push any changes.
4. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-7 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha HEAD`
5. Rerun Shepherd now.
