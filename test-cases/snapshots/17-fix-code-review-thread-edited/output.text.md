# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing

## Review threads to resolve

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r2) `src/util.ts:10` (@reviewer · User) [edited since first look] [status: outdated]: Updated feedback: this is now outdated but body has changed.

## First-look items (1) — acknowledge status before acting

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r2) `src/util.ts:10` (@reviewer · User) [status: outdated, edited]

## Post-fix push

- base: `main`
- resolve: `pr-shepherd resolve 42 --reply-thread-ids PRRT_outdated --message "$DISMISS_MESSAGE"`

## Instructions

1. Review the threads under `## Review threads to resolve`. Human-authored threads are replied to by the `resolve:` command shown below; Shepherd does not resolve them. Bot/non-human threads are included in `--resolve-thread-ids`.
2. Before running the `resolve:` command, remove any thread from `--reply-thread-ids` if the latest visible comment in that thread is your own prior Shepherd reply. Do not reply to your own comments.
3. Run the `resolve:` command shown above, substituting `$DISMISS_MESSAGE` with a one-sentence reply/description of what you changed.
4. Items in `## First-look items` are shown so you can acknowledge their current status before acting. If a first-look thread also appears under `## Review threads to resolve`, its ID is already included in the `resolve:` command; otherwise do not pass first-look-only IDs to mutation flags.
5. Items marked `[edited since first look]`, items under `## Review summaries (edited since first look)`, and any first-look bullet tagged `, edited` were updated by their author after you previously acknowledged them. Read the updated body before deciding whether any matching `## Review threads to resolve` item should be resolved.
6. For any large decisions or rejections you made this iteration, run `pr-shepherd journal 42 '- <decision>'` to append an entry to the `## Shepherd Journal` section. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. The command is idempotent — re-running with the same text is a no-op.
7. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.
