# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_suggest](https://github.com/owner/repo/pull/42#discussion_r3) — `src/parser.ts:15` (@reviewer · User) [suggestion]

> Use a constant here:
> ```suggestion
> const MAX_RETRIES = 3;
> ```

Replaces line 15:
```
const MAX_RETRIES = 3;
```

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_suggest --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. For each thread marked `[suggestion]` under `## Review threads`, run `pr-shepherd build-suggestion-patch 42 --thread-id "<id>" --message "<one-sentence headline>" --format=json` to retrieve its patch and suggested commit.
3. The CLI only builds the patch. Apply it, stage the listed file, and follow the returned commit instructions.
4. If the command refuses because the suggestion is unsafe (an unsafe anchored range or nested/unbalanced suggestion fences), skip patch application and use the manual-edit step below. Do not retry the command.
5. For any other refusal, follow the CLI error's stated recovery action; do not manually edit the suggestion.
6. If the patch does not apply, use the manual-edit step below. Do not retry the command.
7. Keep human-authored thread IDs in `apply review:` so Shepherd replies instead of resolving them.
8. Apply every warranted review fix in each file referenced above.
9. After source drift prevents a generated suggestion patch from applying, replace the heading's exact `path:startLine-endLine` range with the `Replaces lines …` block verbatim. An empty replacement deletes the range. One blank line replaces it with one blank line.
10. When `build-suggestion-patch` refuses because the suggestion is unsafe (an unsafe anchored range or nested/unbalanced suggestion fences), do not apply the replacement block verbatim. Inspect the surrounding source and reviewer intent, then make the intended edit manually.
11. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
12. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
13. Link threads and comments from their headings. Cite reviews by ID.
14. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
15. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
16. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
17. Run the `apply review:` command shown above.
18. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.
