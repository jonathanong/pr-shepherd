# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]
**activity** 0 commits · 0 review rounds · active: `CI / tests`

## Review threads to resolve

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r10) `src/helpers.ts:12` (@reviewer · User) [status: outdated]
  - `commentId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r10) (@reviewer · User)
    > This was outdated by the latest push.

## First-look items (1) — acknowledge status before acting

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r10) `src/helpers.ts:12` (@reviewer · User) [status: outdated]

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids PRRT_outdated --message "$DISMISS_MESSAGE"`

## Instructions

1. Review every item under `## First-look items` before acting.
2. Review the threads under `## Review threads to resolve` before running the generated mutations.
3. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`. Playbook: "Shepherd Journal".
4. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
5. Run the `apply review:` command above. Playbook: "Review-mutation mechanics".
6. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
