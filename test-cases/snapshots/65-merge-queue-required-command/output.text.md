# PR #42 [MERGE]

**status** `READY`
**summary** 1 passing
Merge queue: No [Required]

## Instructions

1. Run the merge queue command exactly as printed: `gh pr merge 42 --repo owner/repo --match-head-commit abc123`.
2. If gh says auto-merge is disabled instead of adding the PR to the queue, run the queue API fallback: `gh api graphql -f 'query=mutation EnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) { enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) { mergeQueueEntry { id } } }' -f pullRequestId=PR_kwDOAAAAAAA -f expectedHeadOid=abc123`.
3. If any command above fails with `GraphQL: API rate limit already exceeded`, or the quota warning reports GraphQL quota exhausted, use REST instead (its quota is separate): `pr-shepherd apply merge https://github.com/owner/repo/pull/42 --require-sha abc123 --merge-action merge_queue --transport rest`.
4. Then iterate immediately with the same options until the PR merges or needs work.
