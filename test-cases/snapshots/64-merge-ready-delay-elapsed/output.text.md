# PR #42 [MERGE]

**status** `READY` · **head** `abc123`
**summary** 1 passing

## Instructions

1. Run the auto-merge command exactly as printed: `gh pr merge 42 --repo owner/repo --match-head-commit abc123 --auto --merge`.
2. Only if GitHub reports that auto-merge is unavailable, run the plain merge fallback: `gh pr merge 42 --repo owner/repo --match-head-commit abc123 --merge`.
3. If `gh` reports a GraphQL rate limit, run: `gh api -X PUT repos/owner/repo/pulls/42/merge -f sha=abc123 -f merge_method=merge`.
4. Rerun with the same options until it merges or needs work. If your other run has these flags, add this PR there.
