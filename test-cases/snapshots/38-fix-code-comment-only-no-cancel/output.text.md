# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
**activity** 0 commits · 0 review rounds · active: `CI / build`

## Actionable comments

### [commentId=IC_comment1](https://github.com/owner/repo/pull/42#issuecomment-1) (@reviewer · User)

> Please update the README with usage examples.

## In-progress runs

- `111`

## Post-fix push

- base: `main`

## Instructions

1. Review each item under `## Actionable comments` and decide whether it needs a code change.
2. If you will push, first cancel every ID under `## In-progress runs` with `gh run cancel <id>`.
3. Ignore cancellation errors for runs that already finished.
4. If you will not push, leave the in-progress runs alone.
5. Apply every warranted review fix in the relevant files.
6. If you changed code, commit any remaining changes and push. Otherwise, do not commit or push.
7. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`.
8. Link threads and comments from their headings. Cite reviews by ID.
9. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
