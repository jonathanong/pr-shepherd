# PR #42 [MERGE]

**status** `READY`
**summary** 1 passing

## Instructions

1. Run the auto-merge command exactly as printed: `gh pr merge 42 --repo owner/repo --match-head-commit abc123 --auto --merge`.
2. Only if GitHub reports that auto-merge is unavailable, run the plain merge fallback: `gh pr merge 42 --repo owner/repo --match-head-commit abc123 --merge`.
3. If `gh` reports a GraphQL rate limit, run: `gh api -X PUT repos/owner/repo/pulls/42/merge -f sha=abc123 -f merge_method=merge`.
4. Then iterate immediately with the same options until the PR merges or needs work.
