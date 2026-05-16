# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Review threads

### [threadId=PRRT_active](https://github.com/owner/repo/pull/42#discussion_r1) — `src/index.ts:42` (@reviewer · User)

> Please rename this variable to be more descriptive.

## Post-fix push

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_active --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Review threads` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs first, apply edits, commit, rebase if the header shows `**branch**` behind/conflicts, push, then run the `resolve:` command. **If no code changes are needed:** skip cancellation/commit/push and run only the `resolve:` command.
2. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
3. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
4. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push).
5. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. If this section already exists, append your entries under it instead of creating a duplicate heading.
6. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to recheck once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
