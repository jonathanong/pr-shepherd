# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- `4801` — `CI › tests` [conclusion: FAILURE]
  > Run tests

## Changes-requested reviews

- `reviewId=PRR_cr_with_check` (@reviewer · User)

## Cancelled runs

- `4801`

## Post-fix push

- base: `main`

## Instructions

1. Review each item under `## Failing checks`, `## Changes-requested reviews` and decide whether it needs a code change.
2. Do not cancel the IDs under `## Cancelled runs` again. The CLI already cancelled them.
3. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for `gh run view` / `gh run rerun` rules.
4. Read every body under `## Changes-requested reviews` and apply any warranted change.
5. If you changed code, commit any remaining changes and push. Otherwise, do not commit or push.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. `[FIX_CODE]` is non-terminal. After completing these steps, iterate again to continue.
