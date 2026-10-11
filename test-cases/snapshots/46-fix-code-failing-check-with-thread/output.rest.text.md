# PR #42 [FIX_CODE]

**status** `FAILING`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-46](https://github.com/owner/repo/pull/42#discussion_r46) — `src/handler.ts:22` (@reviewer)

#### [commentId=PRRC_46](https://github.com/owner/repo/pull/42#discussion_r46) (@reviewer)

> Guard against the null case here.

## Failing checks

- `4601` — `CI › tests (ubuntu)` [conclusion: FAILURE]
  > Run tests
  rerun: `gh run rerun 4601 -R owner/repo`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
5. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-46 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha HEAD`
6. Rerun this command now.
