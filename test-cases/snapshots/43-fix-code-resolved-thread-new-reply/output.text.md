# PR #42 [FIX_CODE]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing · **remainingSeconds** 600
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## First-look items (1) — acknowledge status before acting

- `threadId=PRRT_resolved_reply` [↗](https://github.com/owner/repo/pull/42#discussion_r200) `src/thread-comments.ts:36` (@reviewer · User) [status: resolved, edited]
  - `commentId=PRRC_resolved_1` [↗](https://github.com/owner/repo/pull/42#discussion_r200) (@reviewer · User)
    > Original concern.
  - `commentId=PRRC_resolved_2` [↗](https://github.com/owner/repo/pull/42#discussion_r201) (@author · User)
    > Acknowledged, fixed in latest push.
  - `commentId=PRRC_resolved_3` [↗](https://github.com/owner/repo/pull/42#discussion_r202) (@reviewer · User)
    > Thanks. One follow-up: please add the missing test-case too.

## Post-fix push

- base: `main`

## Instructions

1. Review every item under `## First-look items` before acting.
2. If a first-look thread also appears under `## Review threads to resolve`, its ID is already in `apply review:`. Do not add first-look-only IDs to mutation flags.
3. Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.
4. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
5. Link threads and comments from their headings. Cite reviews by ID.
6. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
