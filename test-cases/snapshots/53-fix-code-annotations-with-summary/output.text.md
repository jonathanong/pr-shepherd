# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- external `https://checks.example/code-quality` — `Code Quality` [conclusion: FAILURE]
  > 1 annotation

## Check annotations

### external `https://checks.example/code-quality` — `Code Quality`

- `check_annotation_5301` [↗](https://github.com/owner/repo/blob/abc123/src/util/parse.ts#L18) `src/util/parse.ts:18` [WARNING] — Unhandled edge case
> Empty input is not handled before indexing.

## Review summaries (first look)

### `reviewId=PRR_summary_with_annotations` (@reviewer · User)

> Static analysis flagged a couple of spots — see the inline annotations.

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Failing checks`, `## Check annotations` and decide whether it needs a code change.
2. Review each body under `## Review summaries (first look)`. Eligible non-human IDs are already in `--minimize-comment-ids`. Record any warranted Shepherd Journal note before review mutations.
3. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.
4. Inspect every referenced range under `## Check annotations` and apply any warranted change.
5. If you changed code, commit any remaining changes, then stop and hand off for a push whose authorization is established outside Shepherd; do not run the remaining review mutations or iterate until the remote PR head changes. Shepherd cannot verify the Git credential's push authorization. If you did not change code, do not commit and continue with the remaining steps.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. `[FIX_CODE]` requires a human handoff for a failing check with no authorized follow-up action. Stop polling after escalating, and resume only after human direction.
