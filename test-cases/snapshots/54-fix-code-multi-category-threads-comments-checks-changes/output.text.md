# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Review threads

### [threadId=PRRT_multi](https://github.com/owner/repo/pull/42#discussion_r54) — `src/index.ts:30` (@reviewer · User)

> Extract this into a helper.

## Actionable comments

### [commentId=IC_multi](https://github.com/owner/repo/pull/42#issuecomment-54) (@reviewer · User)

> Mention the new flag in the README.

## Failing checks

- `5401` — `CI › tests` [conclusion: FAILURE]
  > Run tests

## Changes-requested reviews

- `reviewId=PRR_multi_cr` (@reviewer · User)

## Cancelled runs

- `5401`

## Post-fix push

- base: `main`
- resolve: `pr-shepherd resolve 42 --reply-thread-ids PRRT_multi --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Review threads`, `## Actionable comments`, `## Failing checks`, `## Changes-requested reviews` whether a code change is warranted. **If any code changes are needed:** apply edits, commit, push, then run the `resolve:` command. **If no code changes are needed:** skip the commit/push and run the `resolve:` command.
2. Apply code fixes: read and edit each file referenced above.
3. For each failing check under `## Failing checks`: read any included log excerpt first; fetch the full log with `gh run view <runId> --log-failed` if insufficient; rerun with `gh run rerun <runId> --failed` for transient infra failures, or apply a code fix for real test/build failures; if API/log output lacks detail, open the run URL in the GitHub UI.
4. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.
5. Before running the `resolve:` command, remove any thread from `--reply-thread-ids` if the latest visible comment in that thread is your own prior Shepherd reply. Do not reply to your own comments.
6. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push) and `$DISMISS_MESSAGE` with a one-sentence reply/description of what you changed.
7. Do not re-run `gh run cancel` on the IDs listed under `## Cancelled runs` — those runs were already cancelled by the CLI before this turn.
8. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
9. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
