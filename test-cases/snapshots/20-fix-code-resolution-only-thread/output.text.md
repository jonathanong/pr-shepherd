# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads to resolve

- `threadId=PRRT_minimized` [↗](https://github.com/owner/repo/pull/42#discussion_r5) `src/helpers.ts:5` (@reviewer · User) [status: minimized]: Minor nit: trailing whitespace.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_minimized --message "$DISMISS_MESSAGE"`

## Instructions

1. Review the threads under `## Review threads to resolve` before running mutations. Use the generated commands as shown — see "Review-mutation routing" in the pr-shepherd skill for which flag applies to which ID.
2. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
3. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked thread that is still being resolved is emitted resolve-only, not for another reply.
4. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
5. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
6. `[FIX_CODE]` is non-terminal. After completing these steps, iterate immediately with the same options to continue.
