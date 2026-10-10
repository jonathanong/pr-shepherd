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

## Review threads to resolve

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r2) `src/util.ts:10` (@reviewer · User) [edited since first look] [status: outdated]
  - `commentId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r2) (@reviewer · User)
    > Updated feedback: this is now outdated but body has changed.

## First-look items (1) — acknowledge status before acting

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r2) `src/util.ts:10` (@reviewer · User) [status: outdated, edited]

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids PRRT_outdated --message "$DISMISS_MESSAGE"`

## Instructions

1. Review every item under `## First-look items` before acting.
2. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
3. Review the threads under `## Review threads to resolve` before running the generated mutations.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`. Playbook: "Shepherd Journal".
5. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
6. Run the `apply review:` command above. Playbook: "Review-mutation mechanics".
7. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
