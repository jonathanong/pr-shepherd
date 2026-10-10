# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing · **branch** conflicts with PR base `main`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_suggest_conflict](https://github.com/owner/repo/pull/42#discussion_r51) — `src/config.ts:12` (@reviewer · User) [suggestion]

#### [commentId=PRRT_suggest_conflict](https://github.com/owner/repo/pull/42#discussion_r51) (@reviewer · User)

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
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids PRRT_suggest_conflict --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing.
3. For every `[suggestion]` thread under `## Review threads`, run one `pr-shepherd build-suggestion-patches https://github.com/owner/repo/pull/42 --thread-id "<id>" --message "<one-sentence headline>" --format=json --transport rest`, repeating `--thread-id` and `--message` in displayed order. Playbook: "Suggestion patches".
4. Apply every warranted review fix in each file referenced above.
5. Commit any remaining conflict-resolution changes and push to the PR head branch before review mutations.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`. Playbook: "Shepherd Journal".
7. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command above. Playbook: "Review-mutation mechanics".
10. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
