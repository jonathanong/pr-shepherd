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
4. Triage every failure under `## Failing checks` — read its included log excerpt first. See "CI failure triage" in the pr-shepherd skill for `gh run view` / `gh run rerun` rules.
5. If you changed code, commit any remaining changes and push. Otherwise, do not commit or push.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. `[FIX_CODE]` is non-terminal. After completing these steps, rerun this command to continue.
