# PR #2099 [TRIAGE]

**status** `PENDING` · **merge** `BLOCKED` · **repo** `vouchington/vouchington`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Linear history: [Required]
Required status checks: static, backend, web, cloudflare-worker, lambdas, tooling, gitleaks [Required]
Merge queue: Unknown [Required]
**unreported required** `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`

## Instructions

1. This branch is not behind `main`. No CI checks are running, and required checks have not passed: `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`.
2. Before retriggering, diagnose why the workflows did not start: compare the `on:` triggers and any `paths`, `paths-ignore`, or branch filters of the workflow that emits each required check against this PR's changed files and base branch.
3. If the filters exclude this PR, do not edit the CI workflow and do not retrigger. Escalate to a human with that diagnosis: the filter, and the changed files it skips. Changing CI configuration is a human decision. If the triggers should have run for this head, retrigger once: run `gh api --method PATCH repos/vouchington/vouchington/pulls/2099 -f state=closed`, then run `gh api --method PATCH repos/vouchington/vouchington/pulls/2099 -f state=open`.
4. If those checks are still missing on the next poll, do not close the PR again; report the diagnosis. Shepherd escalates with `required-checks-unreported` when this remains the only blocker.
5. Rerun Shepherd now.
