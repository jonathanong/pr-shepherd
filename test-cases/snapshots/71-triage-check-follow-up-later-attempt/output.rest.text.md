# PR #42 [TRIAGE]

**status** `FAILING` · **repo** `owner/repo`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Failing checks

- `800` — `CI › tests` [conclusion: FAILURE] [attempt: 2]

## Instructions

1. Fix each warranted item.
2. Shepherd has no rerun to offer and no log excerpt to show for the checks under `## Failing checks`, so it cannot tell from GitHub's data why they failed or what would fix them. Find out before acting. Playbook: "Check follow-up".
3. If the cause is within this PR, fix it and push. If a rerun is the right call, run it once. Otherwise make no change and keep what you found. If these checks are unchanged on the next poll, Shepherd escalates with `check-follow-up-unavailable`; report that diagnosis then.
4. Commit and push any changes to the PR head.
5. Rerun Shepherd now.
