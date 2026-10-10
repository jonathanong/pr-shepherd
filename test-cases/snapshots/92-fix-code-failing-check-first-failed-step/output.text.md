# PR #42 [FIX_CODE]

**status** `FAILING` · **repo** `owner/repo`

## Failing checks

- `34906500059` — `Benchmarks › Benchmarks` [conclusion: FAILURE] [rerun authorized]
  > Check benchmark results
  > Benchmark build or execution failed.
  > ##[error]Process completed with exit code 1.
  rerun: `gh run rerun 34906500059 -R owner/repo`

## Instructions

1. Fix each warranted item above.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any code changes.
4. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
