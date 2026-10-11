# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-4](https://github.com/owner/repo/pull/42#discussion_r4) — `src/template.ts:7` (@reviewer) [suggestion]

#### [commentId=PRRC_4](https://github.com/owner/repo/pull/42#discussion_r4) (@reviewer)

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
2. For every `[suggestion]` thread under `## Review threads`, run one `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id "<id>" --message "<one-sentence headline>" --format=json --transport rest`, repeating `--thread-id` and `--message` in displayed order. Playbook: "Suggestion patches".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
5. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-4 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha HEAD`
6. Rerun Shepherd now.
