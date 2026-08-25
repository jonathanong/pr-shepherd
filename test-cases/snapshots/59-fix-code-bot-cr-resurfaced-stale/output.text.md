# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Changes-requested reviews

- `reviewId=PRR_bot_stale` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_stale --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Changes-requested reviews` and decide whether it needs a code change.
2. Read every body under `## Changes-requested reviews` and apply any warranted change.
3. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
5. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for placeholder substitution and ID-retention rules.
6. `[FIX_CODE]` is non-terminal. After completing these steps, rerun this command to continue.
