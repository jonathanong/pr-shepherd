# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
Merge queue: No [Required]
**merge queue** enabled `true` · inQueue `false` · checkCommit `queue-commit-1`
**queue removal** reason `MANUAL` · createdAtUnix `1715799000` · actor `@maintainer` · commit `queue-commit-1` · parents `abc123`

## Failing checks

- `37106358227` — `CI › tests` [conclusion: FAILURE] [scope: merge_group, commit: queue-commit-1]
  > OpenRouter HTTP 529: provider temporarily unavailable

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Triage the merge-queue ejection before any requeue. Update the PR head from the latest base first. Shepherd printed no queue command for this session, so do not enqueue the PR. Playbook: "Merge queue ejection".
4. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. Playbook: "Shepherd Journal".
6. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
