# PR #42 [TRIAGE]

**status** `FAILING` · **repo** `owner/repo` · **head** `abc123`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Failing checks

- `800` — `CI › tests` [conclusion: FAILURE] [attempt: 2]
  > OpenRouter HTTP 529: provider temporarily unavailable

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Some checks under `## Failing checks` have no rerun Shepherd can offer. Playbook: "Check follow-up".
4. Commit and push any changes to the PR head.
5. Rerun Shepherd now.
