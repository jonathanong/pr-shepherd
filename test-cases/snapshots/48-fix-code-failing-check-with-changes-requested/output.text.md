# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- `4801` — `CI › tests` [conclusion: FAILURE] [rerun authorized]
  > Run tests
  rerun: `gh run rerun 4801 -R owner/repo`

## Changes-requested reviews

### `reviewId=PRR_cr_with_check` (@reviewer · User)

> The failing test points at a real bug — please fix the off-by-one in the loop.

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Failing checks`, `## Changes-requested reviews` and decide whether it needs a code change.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Read every body under `## Changes-requested reviews` and apply any warranted change.
4. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. Playbook: "Shepherd Journal".
6. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
