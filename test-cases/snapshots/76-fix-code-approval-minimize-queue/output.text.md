# PR #42 [FIX_CODE]

**status** `READY` · **repo** `owner/repo`
**remainingSeconds** 600

## Review IDs to minimize queue

- `PRR_bot_approval_minimize`

## Instructions

1. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
2. Run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --minimize-comment-ids PRR_bot_approval_minimize`
3. `[FIX_CODE]` is non-terminal. Rerun the same command now.
