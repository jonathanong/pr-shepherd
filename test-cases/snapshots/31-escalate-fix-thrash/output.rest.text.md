# PR #42 [ESCALATE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
**transport** `rest`

## Unavailable transport fields

- `reviewDecision`: REST does not expose an aggregate review decision; latest review states are supplied
- `viewerAuthorization`: REST does not expose viewer capability fields
- `comments.isMinimized`: REST does not expose minimization state or support minimizing comments
- `mergeQueue`: REST does not expose queue membership, entry or removal history
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

- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --transport rest --reply-thread-ids PRRT_thrash --message "$DISMISS_MESSAGE" --resolve-thread-ids PRRT_thrash --require-sha "$HEAD_SHA"`

---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42` to resume.

## Instructions

1. Stop polling. Ask the user whether to run the pending review commands shown above.
2. If yes, replace any `$HEAD_SHA` with the full 40-character pushed PR-head SHA and any `$DISMISS_MESSAGE` with a one-sentence disposition, run every pending command, then rerun Shepherd with the same options.
