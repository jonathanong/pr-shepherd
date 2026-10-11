# PR #2099 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **repo** `vouchington/vouchington`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Linear history: [Required]
Required status checks: 7 [Required]
Merge queue: Unknown [Required]
**unreported required** `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`

## Instructions

1. This branch is not behind `main`. No CI checks are running, and required checks have not passed: `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`.
2. Retrigger workflows once for this head: run `gh api --method PATCH repos/vouchington/vouchington/pulls/2099 -f state=closed`, then run `gh api --method PATCH repos/vouchington/vouchington/pulls/2099 -f state=open`.
3. If those checks are still missing on the next poll, investigate why the workflows did not start. Do not close the PR again. Shepherd escalates with `required-checks-unreported` when this remains the only blocker.
4. Rerun Shepherd now.
