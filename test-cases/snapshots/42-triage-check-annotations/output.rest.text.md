# PR #42 [TRIAGE]

**status** `FAILING` · **repo** `owner/repo`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Failing checks

- external `https://checks.example/code-quality` — `Code Quality` [conclusion: FAILURE]
  > 2 annotations

## Check annotations

### external `https://checks.example/code-quality` — `Code Quality`

- `check_annotation_1001` [↗](https://github.com/owner/repo/blob/abc123/src/commands/check.mts#L136) `src/commands/check.mts:136` [FAILURE] — Missing seen-marker boundary
> Only mark annotations seen after they are rendered.
> The marker should be written from the final triage checks payload.

- `check_annotation_1002` [↗](https://github.com/owner/repo/blob/abc123/src/commands/iterate/triage.mts#L197-L204) `src/commands/iterate/triage.mts:197-204` [WARNING]
> Verify annotations survive lean projection.

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Shepherd has no rerun to offer for some checks under `## Failing checks` (an external status, a later attempt, or a failed merge-queue run). Investigate them with the evidence shown. Playbook: "Check follow-up". If the cause is within this PR, fix it and push. Otherwise make no change and keep what you found; do not rerun or retrigger these checks. If these checks are unchanged on the next poll, Shepherd escalates with `check-follow-up-unavailable`; report that diagnosis then.
4. Inspect every referenced range under `## Check annotations` and apply any warranted change.
5. Commit and push any changes to the PR head.
6. Rerun Shepherd now.
