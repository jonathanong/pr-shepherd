# PR #42 [ESCALATE]

**status** `IN_PROGRESS` · **repo** `owner/repo`
**summary** 1 queued
**activity** 0 commits · 0 review rounds · active: `Deploy / production`

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `stall-timeout`

No progress detected for 60 minutes — state has not changed. This is a manual checkpoint: inspect the PR and apply a manual fix before resuming.

## Items needing attention

- check `Deploy / production` — WAITING check_run, run `700`, waiting 60 minutes
  pending deployment: environment `production`, required reviewers team `release-managers`, `@alice`, viewer can approve: no


---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume. Report the evidence above and the decision the human must make; do not attempt a fix, rerun, requeue, branch update, or merge for this PR.
