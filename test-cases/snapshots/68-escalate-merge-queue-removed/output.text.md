# PR #42 [ESCALATE]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing · **remainingSeconds** 600
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
**merge queue** enabled `false` · inQueue `false` · checkCommit `queue-commit-1`
**queue removal** reason `MERGE_QUEUE_POLICY_CHECK_FAILURE` · createdAtUnix `1715799000` · actor `@github-actions` · commit `queue-commit-1` · parents `abc123`

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `merge-queue-removed`

The PR left the merge queue without an actionable check failure. GitHub reason: MERGE_QUEUE_POLICY_CHECK_FAILURE. Confirm the removal was not intentional before adding it again.

## Merge queue removal

- reason: `MERGE_QUEUE_POLICY_CHECK_FAILURE`
- actor: `@github-actions`
- createdAtUnix: `1715799000`
- queue commit: `queue-commit-1`

---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42 --merge` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume.
