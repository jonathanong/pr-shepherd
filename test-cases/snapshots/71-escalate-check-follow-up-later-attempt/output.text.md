# PR #42 [ESCALATE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `check-follow-up-unavailable`

GitHub reports a later workflow attempt (800: attempt 2), so Shepherd's single rerun allowance is exhausted. Use the included evidence to handle the repeated failure manually before resuming.

## Items needing attention

- run `800`, URL `https://github.com/owner/repo/actions/runs/800` — `CI › tests` [conclusion: FAILURE] [attempt: 2]


---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume.
