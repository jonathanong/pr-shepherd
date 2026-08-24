# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- `200` — `CI / tests` [conclusion: FAILURE]

## Post-fix push

- base: `main`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. For each GitHub Actions failure under `## Failing checks`, read the included log excerpt first.
3. If the excerpt is insufficient, run `gh run view <runId> --log-failed`. Open the run URL only if the API still lacks detail.
4. Rerun transient infrastructure failures with `gh run rerun <runId> --failed`. Apply a code fix for real test or build failures.
5. If you changed code, commit any remaining changes and push. Otherwise, do not commit or push.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`.
7. Link threads and comments from their headings. Cite reviews by ID.
8. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
