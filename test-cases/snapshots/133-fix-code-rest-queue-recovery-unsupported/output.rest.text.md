# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
Merge queue: Unknown [Required]
**merge queue** enabled `true` · inQueue `false` · checkCommit `queue-commit-1`
**queue removal** reason `failed_checks` · createdAtUnix `1715799000` · actor `@github-actions` · commit `queue-commit-1` · parents `abc123`

## Failing checks

- `37106358227` — `CI › tests` [conclusion: FAILURE] [scope: merge_group, commit: queue-commit-1]
  > OpenRouter HTTP 529: provider temporarily unavailable

## Post-fix actions

- base: `main`

## Instructions

1. Queue recovery is transport-unsupported: REST cannot verify current merge-queue removal evidence. Continue the printed fix steps; requeue and removal acknowledgment require verified current removal evidence.
2. Review each item under `## Failing checks` and decide whether it needs a code change.
3. Triage `## Failing checks`. Playbook: "CI failure triage".
4. Triage the merge-queue ejection before any requeue. If the `**queue removal**` reason shows GitHub removed the entry itself, update the PR head from the latest base first. If a person may have dequeued the PR, skip that update unless a conflict step above requires it. Shepherd printed no queue command for this session, so do not enqueue the PR. Playbook: "Merge queue ejection".
5. If the base update or a fix changed the head, commit any remaining changes and push to the PR head branch. If neither did, do not push.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`. Playbook: "Shepherd Journal".
7. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
