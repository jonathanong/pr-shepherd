# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_active](https://github.com/owner/repo/pull/42#discussion_r1) — `src/index.ts:42` (@reviewer · User)

> Please rename this variable to be more descriptive.

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_active --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
5. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked viewer-authored human thread is emitted resolve-only, not for another reply.
6. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
7. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
8. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
9. `[FIX_CODE]` is non-terminal. After completing these steps, iterate again with the same options to continue.
