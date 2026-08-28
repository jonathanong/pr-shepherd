# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### `threadId=PRRT_thread1` — `src/auth.ts:10` (@reviewer · User)

> Please add a docstring here.

## Review summaries (first look)

### `reviewId=PRR_first` (@alice · User)

> First-look comment — never seen before.

## Review summaries (edited since first look — already minimized; do not re-minimize)

### `reviewId=PRR_edited` (@bob · User)

> Updated review comment.

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_thread1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. Review each body under `## Review summaries (first look)`. Eligible non-human IDs are already in `--minimize-comment-ids`. Record any warranted Shepherd Journal note before review mutations.
3. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
4. Apply every warranted review fix in each file referenced above.
5. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked viewer-authored human thread is emitted resolve-only, not for another reply.
8. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
9. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
10. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
11. `[FIX_CODE]` is non-terminal. After completing these steps, iterate again with the same options to continue.
