# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
Merge queue: No [Required]
**merge queue** enabled `true` · inQueue `false` · checkCommit `queue-commit-1`
**queue removal** reason `failed_checks` · createdAtUnix `1715799000` · actor `@github-actions` · commit `queue-commit-1` · parents `abc123`

## Failing checks

- `37106358227` — `CI › tests` [conclusion: FAILURE] [scope: merge_group, commit: queue-commit-1]
  > OpenRouter HTTP 529: provider temporarily unavailable

## Post-fix actions

- base: `main`
- requeue: `gh pr merge 42 --repo owner/repo --match-head-commit abc123`
- requeue API fallback: `gh api graphql -f 'query=mutation EnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) { enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) { mergeQueueEntry { id } } }' -f pullRequestId=PR_kwDOAAAAAAA -f expectedHeadOid=abc123`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. Playbook: "Shepherd Journal".
5. GitHub removed this PR from the merge queue after checks failed on queue commit `queue-commit-1`, which combined the PR head with `main`. Do not requeue without triage. Rebase the PR head onto the latest `main` and reproduce the failing step on the rebased head. If the failure belongs to this PR, fix it, commit, push, and iterate. If the failure does not reproduce and the rebase moved the head, push the rebased head and iterate. Shepherd emits a fresh queue command once the new head is READY; do not run `requeue:` after any push. If the failure reproduces but comes from `main` itself, do not requeue; report it. Only if the rebase was a no-op, no code changed, no other blocker remains, and the logs show a transient failure, run the `requeue:` command exactly as printed. If gh reports auto-merge is disabled instead of adding the PR to the queue, run the `requeue API fallback:` command. Both commands require the observed PR head SHA; if the head changed, iterate for a fresh command.
6. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
