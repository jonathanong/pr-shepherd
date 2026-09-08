# PR #42 [ESCALATE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `base-branch-unknown`

Could not determine the PR's base branch (GraphQL batch returned an empty base branch name) — automated rebases are paused because branch safety is unclear. Run the rebase manually against the PR's real target branch.

## Items needing attention

- thread `PRRT_base` — `src/main.ts:1` (@reviewer · User):

  > Please fix the import order.


## Pending review commands

- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_base --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42` to resume.

## Instructions

1. Pause automated polling and ask the user how to handle this escalation.
2. If directed to complete the pending review mutations, substitute any `$HEAD_SHA` with the current pushed PR-head SHA and any `$DISMISS_MESSAGE` with one specific sentence, then run the commands shown above.
3. After completing the directed recovery, rerun Shepherd with the same options.
