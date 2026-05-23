# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress

## Review threads to resolve

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r10) `src/helpers.ts:12` (@reviewer · User) [status: outdated]: This was outdated by the latest push.

## First-look items (1) — acknowledge status before acting

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r10) `src/helpers.ts:12` (@reviewer · User) [status: outdated]

## Post-fix push

- base: `main`
- resolve: `pr-shepherd resolve 42 --reply-thread-ids PRRT_outdated --message "$DISMISS_MESSAGE"`

## Instructions

1. Review the threads under `## Review threads to resolve`. Human-authored threads are replied to by the `resolve:` command shown below; Shepherd does not resolve them. Non-human threads are shown for context and are not auto-resolved.
2. Run the `resolve:` command shown above, substituting `$DISMISS_MESSAGE` with a one-sentence reply/description of what you changed.
3. Items in `## First-look items` are shown so you can acknowledge their current status before acting. If a first-look thread also appears under `## Review threads to resolve`, its ID is already included in the `resolve:` command; otherwise do not pass first-look-only IDs to mutation flags.
4. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. If this section already exists, append your entries under it instead of creating a duplicate heading.
5. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Recheck: rerun `pr-shepherd 42` to recheck once after a fresh 30s–4m delay.
