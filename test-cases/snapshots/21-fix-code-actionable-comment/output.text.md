# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Actionable comments

### [commentId=IC_actionable](https://github.com/owner/repo/pull/42#issuecomment-1) (@reviewer · User) [edited since first look]

> This approach might cause a race condition. Please review the locking strategy.

## Post-fix push

- base: `main`

## Instructions

1. Review each item under `## Actionable comments` and decide whether it needs a code change.
2. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
3. Apply every warranted review fix in the relevant files.
4. If you changed code, commit any remaining changes and push. Otherwise, do not commit or push.
5. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
6. Link threads and comments from their headings. Cite reviews by ID.
7. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
