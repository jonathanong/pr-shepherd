# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing · **branch** conflicts with PR base `main`
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
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_suggest_conflict --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing.
3. For all threads marked `[suggestion]` under `## Review threads`, run one `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id "<id>" --message "<one-sentence headline>" --format=json` command, repeating the `--thread-id <id> --message <one-sentence headline>` group in displayed order, then apply the returned patches in order. See "Suggestion patches" in the pr-shepherd skill for refusals and drift.
4. Apply every warranted review fix in each file referenced above.
5. Commit any remaining conflict-resolution changes and push to the PR head branch before review mutations.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked thread that is still being resolved is emitted resolve-only, not for another reply.
8. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, commit and push to the PR head branch first, then replace `$HEAD_SHA` with the pushed commit SHA.
9. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
10. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
11. `[FIX_CODE]` is non-terminal: resolve the conflicts, commit, push to the PR head branch, then iterate immediately with the same options.
