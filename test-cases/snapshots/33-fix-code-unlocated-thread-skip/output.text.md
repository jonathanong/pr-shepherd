# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_noloc](https://github.com/owner/repo/pull/42#discussion_r20) — (no location) (@reviewer · User)

> This thread has no file location.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_noloc --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
3. For any substantial decision or rejection, add a Shepherd Journal entry with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`, linking threads and comments by heading URL and citing reviews by ID.
4. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
5. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
6. Run the `apply review:` command above with every printed ID, even if you changed no code.
7. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
