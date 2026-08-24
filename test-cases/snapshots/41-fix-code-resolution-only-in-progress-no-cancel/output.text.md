# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]
**activity** 0 commits · 0 review rounds · active: `CI / tests`

## Review threads to resolve

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r10) `src/helpers.ts:12` (@reviewer · User) [status: outdated]: This was outdated by the latest push.

## First-look items (1) — acknowledge status before acting

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r10) `src/helpers.ts:12` (@reviewer · User) [status: outdated]

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_outdated --message "$DISMISS_MESSAGE"`

## Instructions

1. Review every item under `## First-look items` before acting.
2. If a first-look thread also appears under `## Review threads to resolve`, its ID is already in `apply review:`. Do not add first-look-only IDs to mutation flags.
3. Review the threads under `## Review threads to resolve` before running mutations.
4. Use the generated commands as shown. Human-authored IDs use `--reply-thread-ids`. Bot and non-human IDs use `--resolve-thread-ids`. Shepherd does not resolve human-authored threads.
5. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
6. Link threads and comments from their headings. Cite reviews by ID.
7. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command shown above.
10. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll: run the default `pr-shepherd` command again, or call MCP `iterate` again. Stop only on `[CANCEL]`, `[ESCALATE]`, or human direction.
