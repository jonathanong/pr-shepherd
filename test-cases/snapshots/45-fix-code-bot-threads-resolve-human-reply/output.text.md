# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_human](https://github.com/owner/repo/pull/42#discussion_r45_human) — `src/human.ts:12` (@reviewer · User)

> Please tighten this branch.

### [threadId=PRRT_bot](https://github.com/owner/repo/pull/42#discussion_r45_bot) — `src/bot.ts:20` (@copilot-pull-request-reviewer · Bot)

> Bot-requested cleanup.

### [threadId=PRRT_bracket_bot](https://github.com/owner/repo/pull/42#discussion_r45_bracket_bot) — `src/bracket-bot.ts:30` (@github-actions[bot] · User)

> Bracket bot cleanup.

## Post-fix push

- base: `main`
- resolve-only: `pr-shepherd apply review 42 --resolve-thread-ids PRRT_bot,PRRT_bracket_bot`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_human --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
4. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
5. Link threads and comments from their headings. Cite reviews by ID.
6. Run the `resolve-only:` command shown above.
7. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
8. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
9. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
10. Run the `apply review:` command shown above.
11. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
