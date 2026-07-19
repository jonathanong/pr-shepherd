# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

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

## Post-fix push

- base: `main`

## Instructions

1. Decide for each item under `## Failing checks`, `## Check annotations` whether a code change is warranted. **If any code changes are needed:** apply edits, commit, push. **If no code changes are needed:** no push is needed.
2. For each failing check under `## Failing checks`: for `external` entries: open the URL to inspect the failure.
3. For each item under `## Check annotations`: inspect the referenced file range and decide whether the annotation requires a code change. These annotations are surfaced once per PR and do not need any resolve/minimize mutation.
4. Review the bodies shown under `## Review summaries (first look)` — you are seeing these for the first time. Eligible non-human IDs, when present, are already included in `--minimize-comment-ids` in the resolve or resolve-only command above; if any warrants a Shepherd Journal note, append it before running resolve.
5. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
6. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
