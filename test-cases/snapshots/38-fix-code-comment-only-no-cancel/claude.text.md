# PR #42 [FIX_CODE]

**status** `IN_PROGRESS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing, 1 inProgress

## Actionable comments

### [commentId=IC_comment1](https://github.com/owner/repo/pull/42#issuecomment-1) (@reviewer · User)

> Please update the README with usage examples.

## Post-fix push

- base: `main`
- resolve: `npx pr-shepherd resolve 42 --minimize-comment-ids IC_comment1`

## Instructions

1. Apply code fixes: read and edit each file referenced under `## Review threads` and `## Actionable comments` above.
2. Run the `resolve:` command shown above.
3. For any large decisions or rejections you made this iteration, add or update a `## Shepherd Journal` section in the PR description (`gh pr edit 42 --body …`) summarizing each decision. For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID. If this section already exists, append your entries under it instead of creating a duplicate heading.
4. Single-shot continuation: schedule one session-only follow-up task to run `npx pr-shepherd 42` to recheck once after a fresh delay between 30 seconds and 4 minutes, then end this turn. Do not sleep or rerun inline.
