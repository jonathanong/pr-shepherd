# PR #42 [TRIAGE]

**status** `FAILING`

## Failing checks

- external `https://checks.example/code-quality` — `Code Quality` [conclusion: FAILURE]
  > 1 annotation

## Check annotations

### external `https://checks.example/code-quality` — `Code Quality`

- `check_annotation_5301` [↗](https://github.com/owner/repo/blob/abc123/src/util/parse.ts#L18) `src/util/parse.ts:18` [WARNING] — Unhandled edge case
> Empty input is not handled before indexing.

## Review summaries (first look)

### `reviewId=PRR_summary_with_annotations` (@reviewer)

> Static analysis flagged a couple of spots — see the inline annotations.

## Instructions

1. Fix each warranted item.
2. Read each body under `## Review summaries (first look)` before acting.
3. Triage `## Failing checks`. Playbook: "CI failure triage".
4. Inspect every referenced range under `## Check annotations` and apply any warranted change.
5. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <reason>'`.
6. Commit and push any changes.
7. Rerun Shepherd now.
