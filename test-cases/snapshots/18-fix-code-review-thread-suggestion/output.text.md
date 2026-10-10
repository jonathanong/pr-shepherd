# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **repo** `owner/repo`

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

## Instructions

1. Fix each warranted item above.
2. For every `[suggestion]` thread under `## Review threads`, run one `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id "<id>" --message "<one-sentence headline>" --format=json`, repeating `--thread-id` and `--message` in displayed order. Playbook: "Suggestion patches".
3. Commit and push any code changes.
4. Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. Set `$DISMISS_MESSAGE` to one sentence on what changed and run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_suggest --message "$DISMISS_MESSAGE" --require-sha "$(git rev-parse HEAD)"`
6. `[FIX_CODE]` is non-terminal. Rerun the same command now.
