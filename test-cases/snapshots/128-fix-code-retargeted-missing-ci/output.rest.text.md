# PR #2099 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `vouchington/vouchington`
**summary** 0 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
Linear history: [Required]
Required status checks: 7 [Required]
Merge queue: Unknown [Required]
**unreported required** `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`

## Post-fix actions

- base: `main`

## Instructions

1. This branch is not behind `main`. No CI checks are running, and required checks have not passed: `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`.
2. Retrigger workflows once for this head: run `gh api --method PATCH repos/vouchington/vouchington/pulls/2099 -f state=closed`, then run `gh api --method PATCH repos/vouchington/vouchington/pulls/2099 -f state=open`.
3. If those checks are still missing on the next poll, investigate why the workflows did not start. Do not close the PR again. Shepherd escalates with `required-checks-unreported` when this remains the only blocker.
4. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
