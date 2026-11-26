# PR #42 [TRIAGE]

**status** `FAILING` · **repo** `owner/repo` · **head** `abc123`

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
3. Some checks under `## Failing checks` have no rerun Shepherd can offer. Playbook: "Check follow-up".
4. Inspect every referenced range under `## Check annotations` and apply any warranted change.
5. Commit and push any changes to the PR head.
6. Rerun Shepherd now.
