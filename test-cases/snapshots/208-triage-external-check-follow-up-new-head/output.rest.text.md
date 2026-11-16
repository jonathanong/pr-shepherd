# PR #42 [TRIAGE]

**status** `FAILING` · **repo** `owner/repo`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Failing checks

- external `https://external.ci/builds/42` — `external-status` [conclusion: FAILURE]

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Some checks under `## Failing checks` have no rerun Shepherd can offer. Investigate them with the evidence shown. Playbook: "Check follow-up". Fix a cause within this PR; otherwise change nothing and do not retrigger them. If they are unchanged on the next poll, Shepherd escalates; report your diagnosis then.
4. Commit and push any changes to the PR head.
5. Rerun Shepherd now.
