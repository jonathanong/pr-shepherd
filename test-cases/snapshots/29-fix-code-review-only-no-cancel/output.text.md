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

## In-progress runs

- `777`

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_inline1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Changes-requested reviews` and decide whether it needs a code change.
2. If you will push, first cancel every ID under `## In-progress runs` with `gh run cancel <id>` (ignore errors for runs that already finished). If you will not push, leave them alone.
3. Apply every warranted review fix in each file referenced above.
4. Read every body under `## Changes-requested reviews` and apply any warranted change.
5. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
8. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
9. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
10. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
11. `[FIX_CODE]` is non-terminal. After completing these steps, iterate again with the same options to continue.
