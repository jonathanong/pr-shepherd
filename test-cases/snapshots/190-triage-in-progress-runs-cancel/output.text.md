# PR #42 [TRIAGE]

**status** `FAILING` · **repo** `owner/repo` · **head** `abc123`
**summary** 5 inProgress, 1 queued
**activity** 0 commits · 0 review rounds · active: `CI / e2e`, `CI / lint`, `review`, `format`, `build`, +1 more

## Failing checks

- `500` — `CI › tests` [conclusion: FAILURE]
  > Run tests

## In-progress runs

- `500` — `CI` [status: IN_PROGRESS] failed: CI / tests · running: CI / e2e, CI / lint
  concurrency: cancel-in-progress=true
  cancel: `gh run cancel 500 -R owner/repo`

- `501` — `AI Review` [status: IN_PROGRESS] [never-cancel: AI *]
  concurrency: cancel-in-progress=true

- `502` — `Format` [status: IN_PROGRESS]
  concurrency: none

- `503` — `Build` [status: IN_PROGRESS]
  concurrency: cancel-in-progress=${{ github.ref != 'refs/heads/main' }}

- `504` — `Preview` [status: WAITING]
  concurrency: cancel-in-progress=true

## Instructions

1. If any item will need a code change, cancel run 500 now with its `cancel:` command, before editing; ignore errors for runs that already finished. Cancel no other run: a push does not cancel the rest, so cancelling them only discards their results. If you will push nothing, leave every run running.
2. Fix each warranted item.
3. Triage `## Failing checks`. Playbook: "CI failure triage".
4. Commit and push any changes to the PR head.
5. Rerun Shepherd now.
