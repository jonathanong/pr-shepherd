# PR #2099 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `APPROVED` · **repo** `vouchington/vouchington`
Linear history: [Required]
Required status checks: 7 [Required]
Merge queue: No [Required]
**unreported required** `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`

## Instructions

1. This branch is not behind `main`. No CI checks are running, and required checks have not passed: `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`.
2. Retrigger workflows once for this head with `gh pr close 2099 -R vouchington/vouchington` then `gh pr reopen 2099 -R vouchington/vouchington`.
3. If those checks are still missing on the next poll, investigate why the workflows did not start. Do not close the PR again. Shepherd escalates with `required-checks-unreported` when this remains the only blocker.
4. `[FIX_CODE]` is non-terminal. Rerun the same command now.
