# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

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

## Post-fix push

- base: `main`

## Instructions

1. Decide for each item under `## Failing checks`, `## Check annotations` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs first, apply edits, commit, rebase, push. **If no code changes are needed:** no push is needed.
2. For each failing check under `## Failing checks`: for `external` entries (no run ID, has URL): open the URL to inspect the failure.
3. For each item under `## Check annotations`: inspect the referenced file range and decide whether the annotation requires a code change. These annotations are surfaced once per PR and do not need any resolve/minimize mutation.
4. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
5. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. If this section already exists, append your entries under it instead of creating a duplicate heading.
6. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Recheck: rerun `pr-shepherd 42` to recheck once after a fresh 30s–4m delay.
