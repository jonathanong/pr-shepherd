# PR #42 [FIX_CODE]

**status** `FAILING`
Merge queue: No [Required]
**merge queue** enabled `true` · inQueue `false` · checkCommit `queue-commit-1`
**queue removal** reason `failed_checks` · createdAtUnix `1715799000` · actor `@github-actions` · commit `queue-commit-1` · parents `abc123`

## Failing checks

- `37106358227` — `CI › tests` [conclusion: FAILURE] [scope: merge_group, commit: queue-commit-1]
  > OpenRouter HTTP 529: provider temporarily unavailable

## Post-fix actions

- requeue: `gh pr merge 42 --repo owner/repo --match-head-commit abc123`
- requeue API fallback: `gh api graphql -f 'query=mutation EnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) { enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) { mergeQueueEntry { id } } }' -f pullRequestId=PR_kwDOAAAAAAA -f expectedHeadOid=abc123`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Triage the merge-queue ejection before any requeue. Update the PR head from the latest base first. Run `requeue:` only if the failure does not reproduce on the updated head, neither the update nor a code change altered the head, and no other blocker remains. If gh reports auto-merge is disabled, run `requeue API fallback:` instead. Playbook: "Merge queue ejection".
4. If the base update or a fix changed the head, commit any remaining changes and push to the PR head branch. If neither did, do not push.
5. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
6. Rerun this command now.
