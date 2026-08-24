# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads to resolve

- `threadId=PRRT_minimized` [↗](https://github.com/owner/repo/pull/42#discussion_r5) `src/helpers.ts:5` (@reviewer · User) [status: minimized]: Minor nit: trailing whitespace.

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_minimized --message "$DISMISS_MESSAGE"`

## Instructions

1. Review the threads under `## Review threads to resolve` before running mutations.
2. Use the generated commands as shown. Human-authored IDs use `--reply-thread-ids`. Bot and non-human IDs use `--resolve-thread-ids`. Shepherd does not resolve human-authored threads.
3. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`.
4. Link threads and comments from their headings. Cite reviews by ID.
5. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
6. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
7. Run the `apply review:` command shown above.
8. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
