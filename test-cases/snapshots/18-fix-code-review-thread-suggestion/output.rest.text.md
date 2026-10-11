# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-3](https://github.com/owner/repo/pull/42#discussion_r3) — `src/parser.ts:15` (@reviewer) [suggestion]

#### [commentId=PRRC_3](https://github.com/owner/repo/pull/42#discussion_r3) (@reviewer)

> Use a constant here:
> ```suggestion
> const MAX_RETRIES = 3;
> ```

Replaces line 15:
```
const MAX_RETRIES = 3;
```

## Instructions

1. Fix each warranted item.
2. For every `[suggestion]` thread under `## Review threads`, run one `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id "<id>" --message "<one-sentence headline>" --format=json --transport rest`, repeating `--thread-id` and `--message` in displayed order. Playbook: "Suggestion patches".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
5. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-3 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha HEAD`
6. Rerun Shepherd now.
