# PR #42 [ESCALATE]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 2 inProgress
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
**activity** 0 commits · 0 review rounds · active: `CI / queued`, `External Preview`

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `stall-timeout`

No progress detected for 60 minutes — state has not changed. This is a manual checkpoint: inspect the PR and apply a manual fix before resuming.

## Items needing attention

- check `CI / queued` — QUEUED check_run, run `999`, waiting 60 minutes
  > Waiting for runner
- check `External Preview` — IN_PROGRESS status_context, external `https://ci.example.test/build/42`, waiting 60 minutes
  > Waiting for external service


---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd 42` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume.
