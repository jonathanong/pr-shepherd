# PR #42 [TRIAGE]

**status** `IN_PROGRESS` · **repo** `owner/repo` · **head** `abc123`
**summary** 1 inProgress, 1 queued
**activity** 0 commits · 0 review rounds · active: `CI / queued`, `External Preview`

## Unstarted checks

- check `CI / queued` — QUEUED check_run, run `999`, waiting 60 minutes
  > Waiting for runner
- check `External Preview` — IN_PROGRESS status_context, external `https://ci.example.test/build/42`, waiting 60 minutes
  > Waiting for external service

## Instructions

1. The checks under `## Unstarted checks` have not started after the stall timeout, and Shepherd cannot tell from GitHub's data why. Find out before acting. Playbook: "CI start stall".
2. If the cause is within this PR, fix it and push. Otherwise make no change and keep what you found. If the same checks are still not started on the next poll, Shepherd escalates with `stall-timeout`; report your diagnosis then.
3. Rerun Shepherd now.
