# PR #42 [TRIAGE]

**status** `FAILING` · **merge** `BEHIND` · **repo** `owner/repo`
**branch** behind PR base `main`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Failing checks

- `34906500059` — `Benchmarks › Benchmarks` [conclusion: FAILURE] [blocker released: owner/repo#99]
  > Check benchmark results
  > Benchmark build or execution failed.
  > ##[error]Process completed with exit code 1.

## Instructions

1. Update this PR branch from its base using the repository's branch-update procedure. Do not rerun the job; a rerun retests the old merge ref.
2. Rerun Shepherd now.
