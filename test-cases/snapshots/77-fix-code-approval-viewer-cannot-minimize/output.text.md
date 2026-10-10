# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **repo** `owner/repo`

## Review threads

### [threadId=PRRT_with_denied_approval](https://github.com/owner/repo/pull/42#discussion_r11) — `src/index.ts:11` (@reviewer · User)

> One more nit before this merges.

## Approvals (surfaced — not minimized)

### `reviewId=PRR_bot_approval_denied` (@coderabbitai · Bot) [viewer cannot minimize]

> LGTM! Nice cleanup.

## Instructions

1. Fix each warranted item above.
2. Commit and push any code changes.
3. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
4. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_with_denied_approval --message "$DISMISS_MESSAGE" --require-sha "$(git rev-parse HEAD)"`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
