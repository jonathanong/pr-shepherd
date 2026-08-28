# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing · **branch** conflicts with `origin/main`
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_conflict_thread](https://github.com/owner/repo/pull/42#discussion_r49) — `src/merge.ts:8` (@reviewer · User)

> Rename this helper before merging.

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_conflict_thread --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing and pushing.
3. Apply every warranted review fix in each file referenced above.
4. Commit any remaining changes and push the conflict resolution before review mutations.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
6. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked viewer-authored human thread is emitted resolve-only, not for another reply.
7. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
10. `[FIX_CODE]` is non-terminal. After completing these steps, iterate again with the same options to continue.
