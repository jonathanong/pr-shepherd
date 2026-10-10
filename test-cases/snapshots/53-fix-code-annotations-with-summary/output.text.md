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
2. Read each body under `## Review summaries (first look)` and journal any warranted note before review mutations.
3. Triage `## Failing checks`. Playbook: "CI failure triage".
4. Inspect every referenced range under `## Check annotations` and apply any warranted change.
5. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
6. For any substantial decision or rejection, add a Shepherd Journal entry with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`, linking threads and comments by heading URL and citing reviews by ID.
7. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
