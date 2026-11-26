# PR #42 [TRIAGE]

**status** `READY` · **repo** `owner/repo` · **head** `abc123`
**remainingSeconds** 600
**merge queue** enabled `false` · inQueue `false` · checkCommit `queue-commit-1`
**queue removal** reason `MERGE_CONFLICT` · createdAtUnix `1715799000` · commit `queue-commit-1` · parents `abc123`

## Instructions

1. GitHub removed PR #42 from the merge queue, and Shepherd has no failed queue-commit check to triage. The `**queue removal**` line above carries the raw reason and actor.
2. Decide from them. If the reason names a merge conflict, an invalid merge commit, or a stack that changed, update the PR head from the latest base and push. If a person dequeued the PR (the actor is a user, not a bot or `github-actions`), make no change and report that. If the reason is missing or unclear, find out why before acting. Never enqueue the PR yourself. Playbook: "Merge queue ejection".
3. If the head is unchanged on the next poll, Shepherd escalates with `merge-queue-removed`; report what you found then.
4. Rerun Shepherd now.
