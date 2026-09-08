# PR #42 [ESCALATE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `fix-thrash`

The same thread(s) remain unresolved after their pending review commands were returned for 3 FIX_CODE ticks. Automated iteration is paused for a manual decision.

## Items needing attention

- thread `PRRT_thrash` — `src/auth.ts:88` (@coderabbitai · Bot):

  > This authentication logic is too complex, please simplify.


## Fix attempts

- thread `PRRT_thrash` pending commands returned 3 times

## Pending review commands

- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_thrash --message "$DISMISS_MESSAGE" --resolve-thread-ids PRRT_thrash --require-sha "$HEAD_SHA"`

---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42` to resume.

## Instructions

1. Pause automated polling and ask the user how to handle this escalation.
2. If directed to complete the pending review mutations, substitute any `$HEAD_SHA` with the current pushed PR-head SHA and any `$DISMISS_MESSAGE` with one specific sentence, then run the commands shown above.
3. After completing the directed recovery, rerun Shepherd with the same options.
