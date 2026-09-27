# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing · **branch** conflicts with PR base `main`
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_conflict_thread](https://github.com/owner/repo/pull/42#discussion_r49) — `src/merge.ts:8` (@reviewer · User)

> Rename this helper before merging.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_conflict_thread --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing.
3. Apply every warranted review fix in each file referenced above.
4. Commit any remaining conflict-resolution changes and push to the PR head branch before review mutations.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. Playbook: "Shepherd Journal".
6. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
7. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
8. Run the `apply review:` command above. Playbook: "Review-mutation mechanics".
9. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
