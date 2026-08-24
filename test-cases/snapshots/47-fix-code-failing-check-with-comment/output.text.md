# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Actionable comments

### [commentId=IC_with_check](https://github.com/owner/repo/pull/42#issuecomment-47) (@reviewer · User)

> Please also update the changelog for this change.

## Failing checks

- `4701` — `CI › lint` [conclusion: FAILURE]
  > Run oxlint

## Cancelled runs

- `4701`

## Post-fix push

- base: `main`

## Instructions

1. Review each item under `## Actionable comments`, `## Failing checks` and decide whether it needs a code change.
2. Do not cancel the IDs under `## Cancelled runs` again. The CLI already cancelled them.
3. Apply every warranted review fix in the relevant files.
4. For each GitHub Actions failure under `## Failing checks`, read the included log excerpt first.
5. If the excerpt is insufficient, run `gh run view <runId> --log-failed`. Open the run URL only if the API still lacks detail.
6. Rerun transient infrastructure failures with `gh run rerun <runId> --failed`. Apply a code fix for real test or build failures.
7. If you changed code, commit any remaining changes and push. Otherwise, do not commit or push.
8. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`.
9. Link threads and comments from their headings. Cite reviews by ID.
10. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
