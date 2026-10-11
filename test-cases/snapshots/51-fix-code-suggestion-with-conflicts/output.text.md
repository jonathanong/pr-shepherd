# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY`
**branch** conflicts with PR base `main`

## Review threads

### [threadId=PRRT_suggest_conflict](https://github.com/owner/repo/pull/42#discussion_r51) — `src/config.ts:12` (@reviewer) [suggestion]

> Use a named constant:
> ```suggestion
> const DEFAULT_TIMEOUT_MS = 5000;
> ```

Replaces line 12:
```
const DEFAULT_TIMEOUT_MS = 5000;
```

## Instructions

1. Fix each warranted item.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing.
3. For every `[suggestion]` thread under `## Review threads`, run one `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id "<id>" --message "<one-sentence headline>" --format=json`, repeating `--thread-id` and `--message` in displayed order. Playbook: "Suggestion patches".
4. Commit any remaining conflict-resolution changes and push to the PR head branch before review mutations.
5. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
6. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_suggest_conflict --message "$DISMISS_MESSAGE" --require-sha HEAD`
7. Rerun this command now.
