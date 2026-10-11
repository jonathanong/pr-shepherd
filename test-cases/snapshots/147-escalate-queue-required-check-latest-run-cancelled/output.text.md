# PR #42 [ESCALATE]

**status** `FAILING` · **repo** `owner/repo`
**summary** 2 passing
Required status checks: web [Required]
Merge queue: No [Required]
**merge queue** enabled `false` · inQueue `false` · checkCommit `queue-commit-1`
**queue removal** reason `failed_checks` · createdAtUnix `1715799000` · actor `@github-actions` · commit `queue-commit-1` · parents `abc123`

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `check-follow-up-unavailable`

One or more failing checks have no autonomous follow-up available. Use the displayed conclusion, run or URL, and included evidence to handle them manually.

## Items needing attention

- run `200`, URL `https://github.com/owner/repo/actions/runs/200/job/200` — `web › web` [conclusion: CANCELLED], scope `merge_group` at `queue-commit-1`


---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42 --merge` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume.
