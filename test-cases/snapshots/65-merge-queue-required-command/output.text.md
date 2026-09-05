# PR #42 [MERGE]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
Merge queue: No [Required]
**merge queue** enabled `true` · inQueue `false`

## Merge command

- merge queue: `gh pr merge 42 --repo owner/repo --match-head-commit abc123`
- queue API fallback: `gh api graphql -f 'query=mutation EnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) { enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) { mergeQueueEntry { id } } }' -f pullRequestId=PR_kwDOAAAAAAA -f expectedHeadOid=abc123`

## Instructions

1. Run the `merge queue` command shown above exactly as printed.
2. If the gh CLI says auto-merge is disabled instead of adding the PR to the queue, run the `queue API fallback` command: `gh api graphql -f 'query=mutation EnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) { enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) { mergeQueueEntry { id } } }' -f pullRequestId=PR_kwDOAAAAAAA -f expectedHeadOid=abc123`.
3. Then iterate immediately with the same options to monitor until the PR merges or needs work.
