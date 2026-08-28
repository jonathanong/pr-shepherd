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

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Actionable comments`, `## Failing checks` and decide whether it needs a code change.
2. Apply every warranted review fix in the relevant files.
3. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.
4. If you changed code, commit any remaining changes, then stop and hand off for a push whose authorization is established outside Shepherd; do not run the remaining review mutations or iterate until the remote PR head changes. Shepherd cannot verify the Git credential's push authorization. If you did not change code, do not commit and continue with the remaining steps.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
6. `[FIX_CODE]` requires a human handoff for a failing check with no authorized follow-up action. Stop polling after escalating, and resume only after human direction.
