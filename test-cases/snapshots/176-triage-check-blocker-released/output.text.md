# PR #42 [TRIAGE]

**status** `FAILING` · **merge** `BEHIND` · **repo** `owner/repo`
**branch** behind PR base `main`

## Failing checks

- `34906500059` — `Benchmarks › Benchmarks` [conclusion: FAILURE] [blocker released: owner/repo#99]
  > Check benchmark results
  > Benchmark build or execution failed.
  > ##[error]Process completed with exit code 1.

## Instructions

1. Update this PR branch from its base with `gh pr update-branch 42 --rebase`. Do not rerun the job; a rerun retests the old merge ref.
2. Rerun Shepherd now.
