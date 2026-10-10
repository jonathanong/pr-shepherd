# PR #42 [FIX_CODE]

**status** `FAILING` · **repo** `owner/repo`
**summary** 1 passing
Merge queue: No [Required]
Stack: 7 (layer 1/1, base main)
**merge queue** enabled `true` · inQueue `false` · checkCommit `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`
**queue removal** reason `failed_checks` · createdAtUnix `1715799000` · actor `@github-actions` · commit `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` · parents `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`

## Failing checks

- `37106358227` — `CI › tests` [conclusion: FAILURE] [scope: merge_group, commit: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb]
  > OpenRouter HTTP 529: provider temporarily unavailable

## Instructions

1. Queue recovery is transport-unsupported: REST cannot verify current merge-queue removal evidence. Continue the printed fix steps; requeue and removal acknowledgment require verified current removal evidence.
2. Fix each warranted item above.
3. Triage `## Failing checks`. Playbook: "CI failure triage".
4. Triage the merge-queue ejection before any requeue. If the `**queue removal**` reason shows GitHub removed the entry itself, update the stack from the latest base first: Use the repository's stack-update procedure for native stack #7 in `owner/repo`, starting at bottom open layer PR #42 and preserving the ordered parent boundaries of every affected upper layer. Read membership with REST-backed Shepherd `--stack` output and update and push affected branches using the caller's git workflow. Playbook: "Branch update". If a person may have dequeued the PR, skip that update unless a conflict step above requires it. Shepherd printed no queue command for this session, so do not enqueue the PR. Playbook: "Merge queue ejection".
5. If the base update or a fix changed any heads, commit the remaining changes and push every affected stack branch using the repository's stack-update procedure. If no heads changed, do not push.
6. `[FIX_CODE]` is non-terminal. Rerun the same command now.
