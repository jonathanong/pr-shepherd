# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Actionable comments

### [commentId=IC_with_check](https://github.com/owner/repo/pull/42#issuecomment-47) (@reviewer · User)

> Please also update the changelog for this change.

## Failing checks

- `4701` — `CI › lint` [conclusion: FAILURE] [rerun authorized]
  > Run oxlint
  rerun: `gh run rerun 4701 -R owner/repo`

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Actionable comments`, `## Failing checks` and decide whether it needs a code change.
2. Apply every warranted review fix in the relevant files.
3. Triage `## Failing checks`. Playbook: "CI failure triage".
4. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
5. For any substantial decision or rejection, add a Shepherd Journal entry with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`, linking threads and comments by heading URL and citing reviews by ID.
6. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
