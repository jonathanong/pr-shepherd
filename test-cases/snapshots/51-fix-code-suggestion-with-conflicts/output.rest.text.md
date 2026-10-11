# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY`
**branch** conflicts with PR base `main`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-51](https://github.com/owner/repo/pull/42#discussion_r51) — `src/config.ts:12` (@reviewer) [suggestion]

#### [commentId=PRRC_51](https://github.com/owner/repo/pull/42#discussion_r51) (@reviewer)

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
3. For every `[suggestion]` thread under `## Review threads`, run one `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id "<id>" --message "<one-sentence headline>" --format=json --transport rest`, repeating `--thread-id` and `--message` in displayed order. Playbook: "Suggestion patches".
4. Commit any remaining conflict-resolution changes and push to the PR head branch before review mutations.
5. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
6. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-51 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha HEAD`
7. Rerun Shepherd now.
