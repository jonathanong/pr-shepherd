# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_with_check](https://github.com/owner/repo/pull/42#discussion_r46) — `src/handler.ts:22` (@reviewer · User)

> Guard against the null case here.

## Failing checks

- `4601` — `CI › tests (ubuntu)` [conclusion: FAILURE] [rerun authorized]
  > Run tests
  rerun: `gh run rerun 4601 -R owner/repo`

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_with_check --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Failing checks` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. Triage `## Failing checks`. Playbook: "CI failure triage".
4. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
5. For any substantial decision or rejection, add a Shepherd Journal entry with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`, linking threads and comments by heading URL and citing reviews by ID.
6. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
7. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
8. Run the `apply review:` command above with every printed ID, even if you changed no code.
9. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
