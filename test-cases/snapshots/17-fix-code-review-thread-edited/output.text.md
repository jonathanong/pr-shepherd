# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing

## Review threads to resolve

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r2) `src/util.ts:10` (@reviewer · User) [status: outdated]: Updated feedback: this is now outdated but body has changed.

## First-look items (1) — acknowledge status before acting

- `threadId=PRRT_outdated` [↗](https://github.com/owner/repo/pull/42#discussion_r2) `src/util.ts:10` (@reviewer · User) [status: outdated, edited]

## Post-fix push

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_outdated`

## Instructions

1. Resolve the threads under `## Review threads to resolve` with the `resolve:` command shown below. These threads are already outdated or minimized, so no code edit is required for them unless their body reveals separate work you choose to do.
2. Run the `resolve:` command shown above.
3. Items in `## First-look items` are shown so you can acknowledge their current status before acting. If a first-look thread also appears under `## Review threads to resolve`, its ID is already included in the `resolve:` command; otherwise do not pass first-look-only IDs to mutation flags.
4. Items marked `[edited since first look]`, items under `## Review summaries (edited since first look)`, and any first-look bullet tagged `, edited` were updated by their author after you previously acknowledged them. Read the updated body before deciding whether any matching `## Review threads to resolve` item should be resolved.
5. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. If this section already exists, append your entries under it instead of creating a duplicate heading.
6. Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick. Recheck: rerun `npx pr-shepherd 42` to recheck once after a fresh 30s–4m delay.
