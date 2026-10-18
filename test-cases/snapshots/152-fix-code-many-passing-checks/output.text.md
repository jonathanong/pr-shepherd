# PR #42 [FIX_CODE]

**status** `FAILING` · **repo** `owner/repo`
**summary** 110 passing, 3 inProgress, 2 queued
**activity** 0 commits · 0 review rounds · active: `E2E / browser 1`, `E2E / browser 2`, `E2E / browser 3`, `Deploy / preview 1`, `Deploy / preview 2`

## Failing checks

- `6001` — `Lint › eslint` [conclusion: FAILURE]
  > Run eslint
  rerun: `gh run rerun 6001 -R owner/repo`

- `6002` — `Types › tsc` [conclusion: FAILURE]
  > Run tsc
  rerun: `gh run rerun 6002 -R owner/repo`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Rerun Shepherd now.
