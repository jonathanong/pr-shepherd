# PR #42 [FIX_CODE]

**status** `FAILING` · **repo** `owner/repo`
Merge queue: No [Required]
**merge queue** enabled `true` · inQueue `false` · checkCommit `queue-commit-1`
**queue removal** reason `MANUAL` · createdAtUnix `1715799000` · actor `@maintainer` · commit `queue-commit-1` · parents `abc123`

## Failing checks

- `37106358227` — `CI › tests` [conclusion: FAILURE] [scope: merge_group, commit: queue-commit-1]
  > OpenRouter HTTP 529: provider temporarily unavailable

## Instructions

1. Fix each warranted item above.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Triage the merge-queue ejection before any requeue. If the `**queue removal**` reason shows GitHub removed the entry itself, update the PR head from the latest base first. If a person may have dequeued the PR, skip that update unless a conflict step above requires it. Shepherd printed no queue command for this session, so do not enqueue the PR. Playbook: "Merge queue ejection".
4. If the base update or a fix changed the head, commit any remaining changes and push to the PR head branch. If neither did, do not push.
5. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
6. `[FIX_CODE]` is non-terminal. Rerun the same command now.
