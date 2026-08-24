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

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_suggest_conflict --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing and pushing.
3. For each thread marked `[suggestion]` under `## Review threads`, run `pr-shepherd build-suggestion-patch 42 --thread-id "<id>" --message "<one-sentence headline>" --format=json` to retrieve its patch and suggested commit.
4. The CLI only builds the patch. Apply it, stage the listed file, and follow the returned commit instructions.
5. If the command refuses because the suggestion is unsafe (an unsafe anchored range or nested/unbalanced suggestion fences), skip patch application and use the manual-edit step below. Do not retry the command.
6. For any other refusal, follow the CLI error's stated recovery action; do not manually edit the suggestion.
7. If the patch does not apply, use the manual-edit step below. Do not retry the command.
8. Keep human-authored thread IDs in `apply review:` so Shepherd replies instead of resolving them.
9. Apply every warranted review fix in each file referenced above.
10. After source drift prevents a generated suggestion patch from applying, replace the heading's exact `path:startLine-endLine` range with the `Replaces lines …` block verbatim. An empty replacement deletes the range. One blank line replaces it with one blank line.
11. When `build-suggestion-patch` refuses because the suggestion is unsafe (an unsafe anchored range or nested/unbalanced suggestion fences), do not apply the replacement block verbatim. Inspect the surrounding source and reviewer intent, then make the intended edit manually.
12. Commit any remaining changes and push the conflict resolution before review mutations.
13. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
14. Link threads and comments from their headings. Cite reviews by ID.
15. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
16. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
17. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
18. Run the `apply review:` command shown above.
19. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
