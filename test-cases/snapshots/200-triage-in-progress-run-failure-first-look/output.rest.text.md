# PR #42 [TRIAGE]

**status** `FAILING` · **repo** `owner/repo`
**summary** 1 inProgress
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
**activity** 0 commits · 0 review rounds · active: `CI / e2e`

## Failing checks

- `900` — `CI › tests` [conclusion: FAILURE]
  > Run tests
  > Simulator launch timed out.
  > ##[error]Process completed with exit code 1.

## In-progress runs

- `900` — `CI` [status: IN_PROGRESS] failed: CI / tests · running: CI / e2e
  concurrency: unreadable (no workflow file)

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes to the PR head.
4. Rerun Shepherd now.
