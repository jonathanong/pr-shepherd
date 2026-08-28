# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Changes-requested reviews

- `reviewId=PRR_bot_cr` (@claude · Bot)

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review 42 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_cr --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Changes-requested reviews` and decide whether it needs a code change.
2. Read every body under `## Changes-requested reviews` and apply any warranted change.
3. If you changed code, commit any remaining changes, then stop and hand off for a push whose authorization is established outside Shepherd; do not run the remaining review mutations or iterate until the remote PR head changes. Shepherd cannot verify the Git credential's push authorization. If you did not change code, do not commit and continue with the remaining steps.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
5. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, do not run this command until an authorized push updates the remote PR head; then replace `$HEAD_SHA` with that pushed commit SHA.
6. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
7. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
8. `[FIX_CODE]` is conditional: if you changed code, stop after committing and resume only after an authorized push changes the remote PR head; if you did not change code, complete the authorized review mutations and iterate again with the same options.
