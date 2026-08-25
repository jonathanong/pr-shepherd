# PR #42 [FIX_CODE]

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_multi](https://github.com/owner/repo/pull/42#discussion_r54) — `src/index.ts:30` (@reviewer · User)

> Extract this into a helper.

## Actionable comments

### [commentId=IC_multi](https://github.com/owner/repo/pull/42#issuecomment-54) (@reviewer · User)

> Mention the new flag in the README.

## Failing checks

- `5401` — `CI › tests` [conclusion: FAILURE]
  > Run tests

## Changes-requested reviews

- `reviewId=PRR_multi_cr` (@reviewer · User)

## Cancelled runs

- `5401`

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_multi --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Actionable comments`, `## Failing checks`, `## Changes-requested reviews` and decide whether it needs a code change.
2. Do not cancel the IDs under `## Cancelled runs` again. The CLI already cancelled them.
3. Apply every warranted review fix in each file referenced above.
4. Triage every failure under `## Failing checks` — read its included log excerpt first. See "CI failure triage" in the pr-shepherd skill for `gh run view` / `gh run rerun` rules.
5. Read every body under `## Changes-requested reviews` and apply any warranted change.
6. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
7. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
8. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for placeholder substitution and ID-retention rules.
9. `[FIX_CODE]` is non-terminal. After completing these steps, rerun this command to continue.
