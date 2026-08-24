# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

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
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_multi --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Actionable comments`, `## Failing checks`, `## Changes-requested reviews` and decide whether it needs a code change.
2. Do not cancel the IDs under `## Cancelled runs` again. The CLI already cancelled them.
3. Apply every warranted review fix in each file referenced above.
4. For each GitHub Actions failure under `## Failing checks`, read the included log excerpt first.
5. If the excerpt is insufficient, run `gh run view <runId> --log-failed`. Open the run URL only if the API still lacks detail.
6. Rerun transient infrastructure failures with `gh run rerun <runId> --failed`. Apply a code fix for real test or build failures.
7. Read every body under `## Changes-requested reviews` and apply any warranted change.
8. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
9. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
10. Link threads and comments from their headings. Cite reviews by ID.
11. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
12. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
13. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
14. Run the `apply review:` command shown above.
15. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll: run the default `pr-shepherd` command again, or call MCP `iterate` again. Stop only on `[CANCEL]`, `[ESCALATE]`, or human direction.
