# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS`
**summary** 1 passing

## Review threads

### `threadId=PRRT_main` — `src/api.ts:5` (@alice)

> Rename this function for clarity.

## Actionable comments

### [commentId=IC_user_policy](https://github.com/owner/repo/pull/42#issuecomment-35) (@alice)

> Please mention this in the changelog.

## Review summaries (first look)

### `reviewId=PRR_bot1` (@dependabot[bot] · Bot)

> Bumped dependency x from 1.0.0 to 1.1.0.

### `reviewId=PRR_user1` (@alice)

> LGTM but please add tests.

## Instructions

1. Fix each warranted item.
2. Read each body under `## Review summaries (first look)` and journal any warranted note before review mutations.
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. Run: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --minimize-comment-ids PRR_bot1`
6. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_main --message "$DISMISS_MESSAGE" --require-sha HEAD`
7. Rerun Shepherd now.
