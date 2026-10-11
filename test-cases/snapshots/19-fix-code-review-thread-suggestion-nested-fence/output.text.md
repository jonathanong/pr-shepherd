# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS`

## Review threads

### [threadId=PRRT_nested](https://github.com/owner/repo/pull/42#discussion_r4) — `src/template.ts:7` (@reviewer) [suggestion]

> The suggestion body itself contains a code fence:
> ```suggestion
> const x = ````nested fence````;
> ```

Replaces line 7:
`````
const x = ````nested fence````;
`````

## Instructions

1. Fix each warranted item.
2. For every `[suggestion]` thread under `## Review threads`, run one `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id "<id>" --message "<one-sentence headline>" --format=json`, repeating `--thread-id` and `--message` in displayed order. Playbook: "Suggestion patches".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_nested --message "$DISMISS_MESSAGE" --require-sha HEAD`
6. Rerun Shepherd now.
