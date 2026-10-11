# PR #42 [FIX_CODE]

**status** `FAILING`

## Review threads

### [threadId=PRRT_multi](https://github.com/owner/repo/pull/42#discussion_r54) — `src/index.ts:30` (@reviewer)

> Extract this into a helper.

## Actionable comments

### [commentId=IC_multi](https://github.com/owner/repo/pull/42#issuecomment-54) (@reviewer)

> Mention the new flag in the README.

## Failing checks

- `5401` — `CI › tests` [conclusion: FAILURE]
  > Run tests
  rerun: `gh run rerun 5401 -R owner/repo`

## Changes-requested reviews

### `reviewId=PRR_multi_cr` (@reviewer)

> Blocking until the failing test and the inline notes are addressed.

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_multi --message "$DISMISS_MESSAGE" --require-sha HEAD`
6. Rerun Shepherd now.
