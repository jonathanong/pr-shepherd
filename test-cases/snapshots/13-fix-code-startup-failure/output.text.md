# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- `999` — `CI (startup failure)` [conclusion: STARTUP_FAILURE]
  > Process exited early

## Cancelled runs

- `999`

## Post-fix push

- base: `main`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Do not cancel the IDs under `## Cancelled runs` again. The CLI already cancelled them.
3. For each `[conclusion: STARTUP_FAILURE]` failure, inspect it with `gh run view <runId>` and rerun it with `gh run rerun <runId>` if warranted.
4. If you changed code, commit any remaining changes and push. Otherwise, do not commit or push.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`.
6. Link threads and comments from their headings. Cite reviews by ID.
7. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
