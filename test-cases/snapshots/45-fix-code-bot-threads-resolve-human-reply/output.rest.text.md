# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-990000](https://github.com/owner/repo/pull/42#discussion_r45_human) — `src/human.ts:12` (@reviewer)

#### [commentId=PRRC_990000](https://github.com/owner/repo/pull/42#discussion_r45_human) (@reviewer)

> Please tighten this branch.

### [threadId=rest-thread-990001](https://github.com/owner/repo/pull/42#discussion_r45_bot) — `src/bot.ts:20` (@copilot-pull-request-reviewer · Bot)

#### [commentId=PRRC_990001](https://github.com/owner/repo/pull/42#discussion_r45_bot) (@copilot-pull-request-reviewer · Bot)

> Bot-requested cleanup.

### [threadId=rest-thread-990002](https://github.com/owner/repo/pull/42#discussion_r45_bracket_bot) — `src/bracket-bot.ts:30` (@github-actions[bot])

#### [commentId=PRRC_990002](https://github.com/owner/repo/pull/42#discussion_r45_bracket_bot) (@github-actions[bot])

> Bracket bot cleanup.

## Instructions

1. Fix each warranted item.
2. Commit and push any changes.
3. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
4. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-990000,rest-thread-990001,rest-thread-990002 --message "$DISMISS_MESSAGE" --adopt-existing-replies --resolve-thread-ids rest-thread-990001,rest-thread-990002 --require-sha HEAD`
5. Rerun Shepherd now.
