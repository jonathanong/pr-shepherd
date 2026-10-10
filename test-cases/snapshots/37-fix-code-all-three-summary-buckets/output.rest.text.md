# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### `threadId=PRRT_thread1` — `src/auth.ts:10` (@reviewer · User)

#### `commentId=PRRT_thread1` (@reviewer · User)

> Please add a docstring here.

## Review summaries (first look)

### `reviewId=PRR_first` (@alice · User)

> First-look comment — never seen before.

## Review summaries (edited since first look — already minimized; do not re-minimize)

### `reviewId=PRR_edited` (@bob · User)

> Updated review comment.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids PRRT_thread1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. Read each body under `## Review summaries (first look)` and journal any warranted note before review mutations. Playbook: "Shepherd Journal".
3. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
4. Apply every warranted review fix in each file referenced above.
5. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`. Playbook: "Shepherd Journal".
7. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command above. Playbook: "Review-mutation mechanics".
10. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
