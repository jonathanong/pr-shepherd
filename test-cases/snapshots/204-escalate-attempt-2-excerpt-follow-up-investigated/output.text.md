# PR #42 [ESCALATE]

**status** `FAILING` · **repo** `owner/repo`

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `check-follow-up-unavailable`

GitHub reports a later workflow attempt (800: attempt 2), so Shepherd's single rerun allowance is exhausted. The failing checks below have no rerun Shepherd can offer. After one investigation tick they are unchanged on this head. Report what the investigation found. What remains is a repository, CI-configuration, or workflow-permission change, or waiting out a GitHub incident; each is a human decision.

## Items needing attention

- run `800`, URL `https://github.com/owner/repo/actions/runs/800` — `CI › tests` [conclusion: FAILURE] [attempt: 2]
  > OpenRouter HTTP 529: provider temporarily unavailable


---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume. Report the evidence above and the decision the human must make; do not attempt a fix, rerun, requeue, branch update, or merge for this PR.
