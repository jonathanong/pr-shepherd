# PR #2099 [TRIAGE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `APPROVED` · **repo** `vouchington/vouchington` · **head** `b9ddec6445057649f5ccabe0e2dce51ba7d00c46`
Linear history: [Required]
Required status checks: static, backend, web, cloudflare-worker, lambdas, tooling, gitleaks [Required]
Merge queue: No [Required]
**unreported required** `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`

## Instructions

1. This branch is not behind `main`. No CI checks are running on head `b9ddec6`, and required checks have not passed: `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`.
2. Shepherd cannot tell from GitHub's data why nothing started. Find out before acting. Playbook: "Required checks unreported".
3. If the cause is within this PR, fix it and push. If the workflows should have run and the PR is fine, retrigger once: run `gh pr close 2099 -R vouchington/vouchington` then `gh pr reopen 2099 -R vouchington/vouchington`. Otherwise make no change and keep what you found. If the checks are still missing on the next poll, Shepherd escalates with `required-checks-unreported`; report that diagnosis then.
4. Rerun Shepherd now.
