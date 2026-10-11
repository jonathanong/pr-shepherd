# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **repo** `owner/repo`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-990000](https://github.com/owner/repo/pull/42#discussion_r45_human) — `src/human.ts:12` (@reviewer · User)

#### [commentId=PRRC_990000](https://github.com/owner/repo/pull/42#discussion_r45_human) (@reviewer · User)

> Please tighten this branch.

### [threadId=rest-thread-990001](https://github.com/owner/repo/pull/42#discussion_r45_bot) — `src/bot.ts:20` (@copilot-pull-request-reviewer · Bot)

#### [commentId=PRRC_990001](https://github.com/owner/repo/pull/42#discussion_r45_bot) (@copilot-pull-request-reviewer · Bot)

> Bot-requested cleanup.

### [threadId=rest-thread-990002](https://github.com/owner/repo/pull/42#discussion_r45_bracket_bot) — `src/bracket-bot.ts:30` (@github-actions[bot] · User)

#### [commentId=PRRC_990002](https://github.com/owner/repo/pull/42#discussion_r45_bracket_bot) (@github-actions[bot] · User)

> Bracket bot cleanup.

## Instructions

1. Fix each warranted item above.
2. Commit and push any code changes.
3. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-990000,rest-thread-990001,rest-thread-990002 --message "$DISMISS_MESSAGE" --adopt-existing-replies --resolve-thread-ids rest-thread-990001,rest-thread-990002 --require-sha "$(git rev-parse HEAD)"`
5. `[FIX_CODE]` is non-terminal. Rerun the same command now.
