# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_nested](https://github.com/owner/repo/pull/42#discussion_r4) — `src/template.ts:7` (@reviewer · User) [suggestion]

> The suggestion body itself contains a code fence:
> ```suggestion
> const x = ````nested fence````;
> ```

Replaces line 7:
`````
const x = ````nested fence````;
`````

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_nested --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. For each thread marked `[suggestion]` under `## Review threads`, run `pr-shepherd build-suggestion-patch 42 --thread-id "<id>" --message "<one-sentence headline>" --format=json` to retrieve its patch and suggested commit.
3. The CLI only builds the patch. Apply it, stage the listed file, and follow the returned commit instructions.
4. If the patch does not apply, use the manual-edit step below. Do not retry the command.
5. Keep human-authored thread IDs in `apply review:` so Shepherd replies instead of resolving them.
6. Apply every warranted review fix in each file referenced above.
7. For a manual `[suggestion]` fix, replace the heading's exact `path:startLine-endLine` range with the `Replaces lines …` block verbatim. An empty replacement deletes the range. One blank line replaces it with one blank line.
8. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
9. For any substantial decision or rejection, append `- <decision>` to `## Shepherd Journal` with `pr-shepherd apply journal 42 '- <decision>'`.
10. Link threads and comments from their headings. Cite reviews by ID.
11. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
12. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
13. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
14. Run the `apply review:` command shown above.
15. `[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll: run the default `pr-shepherd` command again, or call MCP `iterate` again. Stop only on `[CANCEL]`, `[ESCALATE]`, or human direction.
