# PR #42 [TRIAGE]

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
3. Shepherd has no rerun to offer for some checks under `## Failing checks` (an external status, a later attempt, or a failed merge-queue run). Investigate them with the evidence shown. Playbook: "Check follow-up". If the cause is within this PR, fix it and push. Otherwise make no change and keep what you found; do not rerun or retrigger these checks. If these checks are unchanged on the next poll, Shepherd escalates with `check-follow-up-unavailable`; report that diagnosis then.
4. Inspect every referenced range under `## Check annotations` and apply any warranted change.
5. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 --transport rest '- <reason>'`.
6. Commit and push any changes to the PR head.
7. `$CHANGE_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids rest-thread-55 --message "$CHANGE_MESSAGE" --adopt-existing-replies --require-sha HEAD`
8. Rerun Shepherd now.
