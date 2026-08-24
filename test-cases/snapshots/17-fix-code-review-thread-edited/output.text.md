# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads to resolve

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r2) `src/util.ts:10` (@reviewer · User) [edited since first look] [status: outdated]: Updated feedback: this is now outdated but body has changed.

## First-look items (1) — acknowledge status before acting

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r2) `src/util.ts:10` (@reviewer · User) [status: outdated, edited]

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_outdated --message "$DISMISS_MESSAGE"`

## Instructions

1. Review every item under `## First-look items` before acting.
2. If a first-look thread also appears under `## Review threads to resolve`, its ID is already in `apply review:`. Do not add first-look-only IDs to mutation flags.
3. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
4. Review the threads under `## Review threads to resolve` before running mutations.
5. Use the generated commands as shown. Human-authored IDs use `--reply-thread-ids`. Bot and non-human IDs use `--resolve-thread-ids`. Shepherd does not resolve human-authored threads.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`.
7. Link threads and comments from their headings. Cite reviews by ID.
8. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
9. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
10. Run the `apply review:` command shown above.
11. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
