# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing

## Review threads

### [threadId=PRRT_human](https://github.com/owner/repo/pull/42#discussion_r45_human) — `src/human.ts:12` (@reviewer · User)

> Please tighten this branch.

### [threadId=PRRT_bot](https://github.com/owner/repo/pull/42#discussion_r45_bot) — `src/bot.ts:20` (@copilot-pull-request-reviewer · Bot)

> Bot-requested cleanup.

### [threadId=PRRT_bracket_bot](https://github.com/owner/repo/pull/42#discussion_r45_bracket_bot) — `src/bracket-bot.ts:30` (@github-actions[bot] · User)

> Bracket bot cleanup.

## Post-fix push

- base: `main`
- resolve-only: `pr-shepherd resolve 42 --resolve-thread-ids PRRT_bot,PRRT_bracket_bot`
- resolve: `pr-shepherd resolve 42 --reply-thread-ids PRRT_human --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Review threads` whether a code change is warranted. **If any code changes are needed:** apply edits, commit, push, then run the `resolve:` command. **If no code changes are needed:** skip the commit/push and run the `resolve:` command.
2. Apply code fixes: read and edit each file referenced above.
3. Run the `resolve-only:` command shown above — no substitutions needed.
4. Before running the `resolve:` command, remove any thread from `--reply-thread-ids` if the latest visible comment in that thread is your own prior Shepherd reply. Do not reply to your own comments.
5. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push) and `$DISMISS_MESSAGE` with a one-sentence reply/description of what you changed.
6. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
7. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
