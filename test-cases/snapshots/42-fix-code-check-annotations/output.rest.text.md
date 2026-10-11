# PR #42 [FIX_CODE]

**status** `FAILING`
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
> The marker should be written from the final fix-code checks payload.

- `check_annotation_1002` [↗](https://github.com/owner/repo/blob/abc123/src/commands/iterate/fix-code.mts#L197-L204) `src/commands/iterate/fix-code.mts:197-204` [WARNING]
> Verify annotations survive lean projection.

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Inspect every referenced range under `## Check annotations` and apply any warranted change.
4. Commit and push any changes.
5. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
6. Rerun this command now.
