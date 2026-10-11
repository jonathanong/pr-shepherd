# PR #42 [FIX_CODE]

**status** `FAILING`
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history

## Review threads

### [threadId=rest-thread-55](https://github.com/owner/repo/pull/42#discussion_r55) — `src/util/parse.ts:18` (@reviewer)

#### [commentId=PRRC_55](https://github.com/owner/repo/pull/42#discussion_r55) (@reviewer)

> Same edge case the analyzer flagged — please handle empty input.

## Failing checks

- external `https://checks.example/code-quality` — `Code Quality` [conclusion: FAILURE]
  > 1 annotation

## Check annotations

### external `https://checks.example/code-quality` — `Code Quality`

- `check_annotation_5501` [↗](https://github.com/owner/repo/blob/abc123/src/util/parse.ts#L18) `src/util/parse.ts:18` [FAILURE] — Unhandled edge case
> Empty input is not handled before indexing.

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Inspect every referenced range under `## Check annotations` and apply any warranted change.
4. Commit and push any changes.
5. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <decision>'`
6. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-55 --message "$DISMISS_MESSAGE" --adopt-existing-replies --require-sha HEAD`
7. Rerun this command now.
