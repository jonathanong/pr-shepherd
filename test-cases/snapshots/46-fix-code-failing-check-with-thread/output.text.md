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

## Cancelled runs

- `4601`

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_with_check --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Failing checks` and decide whether it needs a code change.
2. Do not cancel the IDs under `## Cancelled runs` again. The CLI already cancelled them.
3. Apply every warranted review fix in each file referenced above.
4. Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for `gh run view` / `gh run rerun` rules.
5. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
6. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
7. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
8. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
9. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
10. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
11. `[FIX_CODE]` is non-terminal. After completing these steps, iterate again with the same options to continue.
