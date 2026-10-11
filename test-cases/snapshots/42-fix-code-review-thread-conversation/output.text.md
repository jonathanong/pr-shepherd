# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS`

## Review threads

### [threadId=PRRT_conversation](https://github.com/owner/repo/pull/42#discussion_r100) — `src/thread-comments.ts:20-24` (@reviewer)

#### [commentId=PRRC_conversation_1](https://github.com/owner/repo/pull/42#discussion_r100) (@reviewer)

> Initial concern should remain visible.

#### [commentId=PRRC_conversation_2](https://github.com/owner/repo/pull/42#discussion_r101) (@author)

> I pushed a partial fix, but I am not sure about the edge case.

#### [commentId=PRRC_conversation_3](https://github.com/owner/repo/pull/42#discussion_r102) (@reviewer)

> The edge case still matters; please handle null nodes too.

## Instructions

1. Fix each warranted item.
2. Commit and push any changes.
3. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
4. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_conversation --message "$DISMISS_MESSAGE" --require-sha HEAD`
5. Rerun Shepherd now.
