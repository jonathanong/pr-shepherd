# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing · **branch** conflicts with `origin/main`

## Review threads

### [threadId=PRRT_suggest_conflict](https://github.com/owner/repo/pull/42#discussion_r51) — `src/config.ts:12` (@reviewer · User) [suggestion]

> Use a named constant:
> ```suggestion
> const DEFAULT_TIMEOUT_MS = 5000;
> ```

Replaces line 12:
```
const DEFAULT_TIMEOUT_MS = 5000;
```

## Post-fix push

- base: `main`
- resolve: `pr-shepherd resolve 42 --reply-thread-ids PRRT_suggest_conflict --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. The branch has merge conflicts that must be resolved before merging (see `**branch**` above). Apply any code edits for items under `## Review threads`, then commit and push, then run the `resolve:` command.
2. For each thread marked `[suggestion]` under `## Review threads`: run `pr-shepherd commit-suggestion 42 --thread-id "<id>" --message "<one-sentence headline>" --format=json` to retrieve the patch and suggested commit. The CLI does not mutate the working tree — apply the patch yourself (run `git apply` with the diff shown, or edit the file directly using the line range), then stage the listed file and run the suggested `git commit` from the `## Instructions` section. Human-authored thread IDs are replied to by the resolve command below; Shepherd does not auto-resolve them. If the patch fails to apply, fall through to the manual-edit step. Do not retry the same command.
3. Apply code fixes: read and edit each file referenced under `## Review threads` above. When applying a `[suggestion]` thread manually (e.g. after a failed `commit-suggestion` run), replace the exact line range shown in the heading (`path:startLine-endLine`) with the replacement shown in its `Replaces lines …` block verbatim — an empty replacement deletes those lines, a single blank line replaces the range with one blank line.
4. Before running the `resolve:` command, remove any thread from `--reply-thread-ids` if the latest visible comment in that thread is your own prior Shepherd reply. Do not reply to your own comments.
5. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push) and `$DISMISS_MESSAGE` with a one-sentence reply/description of what you changed.
6. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
7. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
