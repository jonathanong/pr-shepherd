# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### `threadId=PRRT_thread1` — `src/auth.ts:10` (@reviewer · User)

> Please fix this.

## Changes-requested reviews

- `reviewId=PRR_overlap` (@reviewer · User)

## Review summaries (first look)

### `reviewId=PRR_overlap` (@reviewer · User)

> Please refactor the auth module.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_thread1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Changes-requested reviews` and decide whether it needs a code change.
2. Review each body under `## Review summaries (first look)`. Eligible non-human IDs are already in `--minimize-comment-ids`. Record any warranted Shepherd Journal note before review mutations.
3. Apply every warranted review fix in each file referenced above.
4. Read every body under `## Changes-requested reviews` and apply any warranted change.
5. If you changed code, commit and push the changes, then iterate again; do not run the remaining review mutations until the remote PR head reflects your push. If you did not change code, do not commit and continue with the remaining steps.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked viewer-authored human thread is emitted resolve-only, not for another reply.
8. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, push it first so the remote PR head updates; then replace `$HEAD_SHA` with that pushed commit SHA.
9. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
10. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
11. `[FIX_CODE]` is conditional: if you changed code, commit and push it, then iterate again once the remote PR head reflects your push; if you did not change code, complete the authorized review mutations and iterate again with the same options.
