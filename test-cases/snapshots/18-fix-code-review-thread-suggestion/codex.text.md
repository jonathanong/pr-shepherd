# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Review threads

### [threadId=PRRT_suggest](https://github.com/owner/repo/pull/42#discussion_r3) — `src/parser.ts:15` (@reviewer · User) [suggestion]

> Use a constant here:
> ```suggestion
> const MAX_RETRIES = 3;
> ```

Replaces line 15:
```
const MAX_RETRIES = 3;
```

## Post-fix push

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_suggest --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Review threads` and `## Actionable comments` whether a code change is warranted. **If any code changes are needed:** cancel in-progress runs, apply edits, commit, rebase if the header shows `**branch**` behind/conflicts, push, then run the `resolve:` command. **If no code changes are needed:** skip cancellation/commit/push and run only the `resolve:` command.
2. For each thread marked `[suggestion]` under `## Review threads`: run `npx pr-shepherd commit-suggestion 42 --thread-id "<id>" --message "<one-sentence headline>" --format=json` to retrieve the patch and suggested commit. The CLI does not mutate the working tree — apply the patch yourself (run `git apply` with the diff shown, or edit the file directly using the line range), then stage the listed file and run the suggested `git commit` from the `## Instructions` section. Include the thread ID in `--resolve-thread-ids` in the resolve command below (the thread is not auto-resolved). If the patch fails to apply, fall through to the manual-edit step. Do not retry the same command.
3. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above. When applying a `[suggestion]` thread manually (e.g. after a failed `commit-suggestion` run), replace the exact line range shown in the heading (`path:startLine-endLine`) with the replacement shown in its `Replaces lines …` block verbatim — an empty replacement deletes those lines, a single blank line replaces the range with one blank line.
4. If you applied code edits: commit them with a descriptive message, then rebase onto `origin/main` per your repository's conventions before pushing.
5. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push).
6. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. If this section already exists, append your entries under it instead of creating a duplicate heading.
7. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Pick a fresh sleep/timeout between 30 seconds and 4 minutes, wait that long, then rerun `npx pr-shepherd 42` to recheck.
