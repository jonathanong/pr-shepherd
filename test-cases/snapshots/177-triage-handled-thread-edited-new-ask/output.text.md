# PR #42 [TRIAGE]

**status** `UNRESOLVED_COMMENTS`
**summary** 1 passing

## Review threads

### [threadId=PRRT_edited_ask](https://github.com/owner/repo/pull/42#discussion_r7) — `src/paginate.ts:18` (@reviewer) [edited since first look]

> nit: rename `n` to `pageSize`.
>
> Edit: also, this loop uses `i <= items.length`, so the last page reads one past the end and returns `undefined`. Please fix the bound and add a test for an exact multiple of `pageSize`.

## Instructions

1. Fix each warranted item.
2. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <reason>'`.
3. Commit and push any changes.
4. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_edited_ask --message "$DISMISS_MESSAGE" --require-sha HEAD`
5. Rerun Shepherd now.
