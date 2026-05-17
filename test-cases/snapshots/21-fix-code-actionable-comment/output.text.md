# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing

## Actionable comments

### [commentId=IC_actionable](https://github.com/owner/repo/pull/42#issuecomment-1) (@reviewer · User) [edited since first look]

> This approach might cause a race condition. Please review the locking strategy.

## Post-fix push

- base: `main`

## Instructions

1. Decide for each item under `## Actionable comments` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs first, apply edits, commit, rebase, push. **If no code changes are needed:** no push is needed.
2. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
3. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
4. Items marked `[edited since first look]`, items under `## Review summaries (edited since first look)`, and any first-look bullet tagged `, edited` were updated by their author after you previously acknowledged them. Read the updated body before deciding whether any matching `## Review threads to resolve` item should be resolved.
5. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Recheck: rerun `npx pr-shepherd 42` to recheck once after a fresh 30s–4m delay.
