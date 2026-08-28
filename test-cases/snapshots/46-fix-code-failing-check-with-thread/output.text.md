# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_with_check](https://github.com/owner/repo/pull/42#discussion_r46) — `src/handler.ts:22` (@reviewer · User)

> Guard against the null case here.

## Failing checks

- `4601` — `CI › tests (ubuntu)` [conclusion: FAILURE]
  > Run tests

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_with_check --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Failing checks` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.
4. If you changed code, commit any remaining changes, then stop and hand off for a push whose authorization is established outside Shepherd; do not run the remaining review mutations or iterate until the remote PR head changes. Shepherd cannot verify the Git credential's push authorization. If you did not change code, do not commit and continue with the remaining steps.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
6. Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked viewer-authored human thread is emitted resolve-only, not for another reply.
7. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, do not run this command until an authorized push updates the remote PR head; then replace `$HEAD_SHA` with that pushed commit SHA.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
10. `[FIX_CODE]` requires a human handoff for a failing check with no authorized follow-up action. Stop polling after escalating, and resume only after human direction.
