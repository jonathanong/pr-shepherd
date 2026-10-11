# PR #42 [FIX_CODE]

**status** `FAILING`

## Review threads

### [threadId=PRRT_with_check](https://github.com/owner/repo/pull/42#discussion_r46) — `src/handler.ts:22` (@reviewer)

> Guard against the null case here.

## Failing checks

- `4601` — `CI › tests (ubuntu)` [conclusion: FAILURE]
  > Run tests
  rerun: `gh run rerun 4601 -R owner/repo`

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Journal key decisions or rejections with URLs or IDs: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`
5. Set `$DISMISS_MESSAGE` to a one-line outcome; run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_with_check --message "$DISMISS_MESSAGE" --require-sha HEAD`
6. Rerun this command now.
