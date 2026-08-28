# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]
**activity** 0 commits · 0 review rounds · active: `CI / tests`

## Review threads

### `threadId=PRRT_inline1` — `src/index.ts:5` (@reviewer · User)

> Please rename this variable.

## Changes-requested reviews

- `reviewId=PRR_changes_only` (@reviewer · User)

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_inline1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Changes-requested reviews` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. Read every body under `## Changes-requested reviews` and apply any warranted change.
4. If you changed code, commit any remaining changes, then stop and hand off for a push whose authorization is established outside Shepherd; do not run the remaining review mutations or iterate until the remote PR head changes. Shepherd cannot verify the Git credential's push authorization. If you did not change code, do not commit and continue with the remaining steps.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
6. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked viewer-authored human thread is emitted resolve-only, not for another reply.
7. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, do not run this command until an authorized push updates the remote PR head; then replace `$HEAD_SHA` with that pushed commit SHA.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
10. `[FIX_CODE]` is conditional: if you changed code, stop after committing and resume only after an authorized push changes the remote PR head; if you did not change code, complete the authorized review mutations and iterate again with the same options.
