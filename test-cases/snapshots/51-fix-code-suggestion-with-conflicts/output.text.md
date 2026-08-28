# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing · **branch** conflicts with `origin/main`
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_suggest_conflict](https://github.com/owner/repo/pull/42#discussion_r51) — `src/config.ts:12` (@reviewer · User) [suggestion]

> Use a named constant:
> ```suggestion
> const DEFAULT_TIMEOUT_MS = 5000;
> ```

Replaces line 12:
```
const DEFAULT_TIMEOUT_MS = 5000;
```

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing.
3. For all threads marked `[suggestion]` under `## Review threads`, run one `pr-shepherd build-suggestion-patches 42 --thread-id "<id>" --message "<one-sentence headline>" --format=json` command, repeating the `--thread-id <id> --message <one-sentence headline>` group in displayed order, then apply the returned patches in order. See "Suggestion patches" in the pr-shepherd skill for refusals and drift.
4. Apply every warranted review fix in each file referenced above.
5. Commit any remaining conflict-resolution changes.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. `[FIX_CODE]` requires a human handoff for an authorized push after conflict resolution. Shepherd cannot verify the Git credential's push authorization. Stop polling after committing, and resume only after the remote PR head changes.
