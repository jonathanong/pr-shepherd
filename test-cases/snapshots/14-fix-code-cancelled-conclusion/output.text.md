# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- `555` — `CI / build` [conclusion: CANCELLED]

## Cancelled runs

- `555`

## Post-fix push

- base: `main`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Do not cancel the IDs under `## Cancelled runs` again. The CLI already cancelled them.
3. For each `[conclusion: CANCELLED]` failure, run `gh run rerun <runId>` unless this tick will push new commits.
4. Do not treat a cancelled failure as resolved. `## Cancelled runs` is a different section.
5. If you changed code, commit any remaining changes and push. Otherwise, do not commit or push.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`.
7. Link threads and comments from their headings. Cite reviews by ID.
8. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
