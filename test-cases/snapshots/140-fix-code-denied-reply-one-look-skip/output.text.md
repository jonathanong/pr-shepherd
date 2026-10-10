# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=rest-thread-12](https://github.com/owner/repo/pull/42#discussion_r12) — `src/retry.ts:17` (@reviewer · User)

> Please add a regression test for the retry limit.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-12 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
5. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
6. Run the `apply review:` command above. Playbook: "Review-mutation mechanics".
7. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
