# PR #42 [TRIAGE]

**status** `FAILING` · **repo** `owner/repo`

## Failing checks

- external `https://checks.example/code-quality` — `Code Quality` [conclusion: FAILURE]
  > 1 annotation

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Shepherd has no rerun to offer for some checks under `## Failing checks` (an external status, a later attempt, or a failed merge-queue run). Investigate them with the evidence shown. Playbook: "Check follow-up". If the cause is within this PR, fix it and push. Otherwise make no change and keep what you found; do not rerun or retrigger these checks. If these checks are unchanged on the next poll, Shepherd escalates with `check-follow-up-unavailable`; report that diagnosis then.
4. Commit and push any changes to the PR head.
5. Rerun Shepherd now.
