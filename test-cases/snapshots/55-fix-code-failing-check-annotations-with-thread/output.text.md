# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_with_annotations](https://github.com/owner/repo/pull/42#discussion_r55) — `src/util/parse.ts:18` (@reviewer · User)

> Same edge case the analyzer flagged — please handle empty input.

## Failing checks

- external `https://checks.example/code-quality` — `Code Quality` [conclusion: FAILURE]
  > 1 annotation

## Check annotations

### external `https://checks.example/code-quality` — `Code Quality`

- `check_annotation_5501` [↗](https://github.com/owner/repo/blob/abc123/src/util/parse.ts#L18) `src/util/parse.ts:18` [FAILURE] — Unhandled edge case
> Empty input is not handled before indexing.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_with_annotations --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Failing checks`, `## Check annotations` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.
4. Inspect every referenced range under `## Check annotations` and apply any warranted change.
5. If you changed code, commit any remaining changes, then stop and hand off for a push whose authorization is established outside Shepherd; do not run the remaining review mutations or iterate until the remote PR head changes. Shepherd cannot verify the Git credential's push authorization. If you did not change code, do not commit and continue with the remaining steps.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked viewer-authored human thread is emitted resolve-only, not for another reply.
8. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, do not run this command until an authorized push updates the remote PR head; then replace `$HEAD_SHA` with that pushed commit SHA.
9. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
10. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
11. `[FIX_CODE]` requires a human handoff for a failing check with no authorized follow-up action. Stop polling after escalating, and resume only after human direction.
