# PR #42 [FIX_CODE]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing · **remainingSeconds** 600
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Review IDs to minimize queue

- `PRR_bot_approval_minimize`

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --minimize-comment-ids PRR_bot_approval_minimize`

## Instructions

1. For any substantial decision or rejection, add a Shepherd Journal entry with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`, linking threads and comments by heading URL and citing reviews by ID.
2. Run the `apply review:` command above with every printed ID, even if you changed no code.
3. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
