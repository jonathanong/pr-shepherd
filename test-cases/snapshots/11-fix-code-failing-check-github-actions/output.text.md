# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- `1234567890` — `CI › tests (ubuntu)` [conclusion: FAILURE]
  > Run tests

## Cancelled runs

- `1234567890`

## Post-fix push

- base: `main`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Do not cancel the IDs under `## Cancelled runs` again. The CLI already cancelled them.
3. For each GitHub Actions failure under `## Failing checks`, read the included log excerpt first.
4. If the excerpt is insufficient, run `gh run view <runId> --log-failed`. Open the run URL only if the API still lacks detail.
5. Rerun transient infrastructure failures with `gh run rerun <runId> --failed`. Apply a code fix for real test or build failures.
6. If you changed code, commit any remaining changes and push. Otherwise, do not commit or push.
7. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
8. Link threads and comments from their headings. Cite reviews by ID.
9. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll: run the default `pr-shepherd` command again, or call MCP `iterate` again. Stop only on `[CANCEL]`, `[ESCALATE]`, or human direction.
