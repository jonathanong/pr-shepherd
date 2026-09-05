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

1. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
2. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
3. `[FIX_CODE]` is non-terminal. After completing these steps, iterate immediately with the same options to continue.
