# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing

## Changes-requested reviews

- `reviewId=PRR_bot_stale` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]

## Post-fix push

- base: `main`
- resolve: `pr-shepherd resolve 42 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_stale --require-sha "$HEAD_SHA"`

## Instructions

1. Decide for each item under `## Changes-requested reviews` whether a code change is warranted. **If any code changes are needed:** apply edits, commit, push, then run the `resolve:` command. **If no code changes are needed:** skip the commit/push and run the `resolve:` command.
2. For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes. Bullets tagged `[pending dismissal — already surfaced]` are bot CR reviews you saw on a previous tick; the CLI hides re-surfaced bodies to keep output lean — re-read the prior tick if you need the body.
3. Pass every ID listed in `--dismiss-review-ids` to the `resolve:` command verbatim — these are bot/non-human CR reviews that the agent (not the author) must dismiss. Dropping an ID leaves the PR in `CHANGES_REQUESTED` state; the next tick re-surfaces it as `[pending dismissal]` and an unattended bot CR escalates after `iterate.stallTimeoutMinutes`.
4. Run the `resolve:` command shown above, substituting `$HEAD_SHA` with the pushed commit SHA (or `$(git rev-parse HEAD)` if you did not push) and `$DISMISS_MESSAGE` with a one-sentence reply/description of what you changed.
5. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
6. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
