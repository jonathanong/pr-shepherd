# PR #42 [TRIAGE]

**status** `UNRESOLVED_COMMENTS`
**summary** 1 passing

## Review threads

### `threadId=PRRT_thread1` — `src/auth.ts:10` (@reviewer)

> Please add a docstring here.

## Review summaries (first look)

### `reviewId=PRR_first` (@alice)

> First-look comment — never seen before.

## Review summaries (edited since first look — already minimized; do not re-minimize)

### `reviewId=PRR_edited` (@bob)

> Updated review comment.

## Instructions

1. Fix each warranted item.
2. Read each body under `## Review summaries (first look)` before acting.
3. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
4. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <reason>'`.
5. Commit and push any changes.
6. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_thread1 --message "$DISMISS_MESSAGE" --require-sha HEAD`
7. Rerun Shepherd now.
