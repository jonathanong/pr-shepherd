# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_nested](https://github.com/owner/repo/pull/42#discussion_r4) — `src/template.ts:7` (@reviewer · User) [suggestion]

> The suggestion body itself contains a code fence:
> ```suggestion
> const x = ````nested fence````;
> ```

Replaces line 7:
`````
const x = ````nested fence````;
`````

## Post-fix push

- base: `main`
- apply review: `pr-shepherd apply review 42 --reply-thread-ids PRRT_nested --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. For each thread marked `[suggestion]` under `## Review threads`, run `pr-shepherd build-suggestion-patch 42 --thread-id "<id>" --message "<one-sentence headline>" --format=json` and apply the returned patch. See "Suggestion patches" in the pr-shepherd skill for refusals and drift.
3. Apply every warranted review fix in each file referenced above.
4. If you changed code, commit any remaining changes and push before review mutations. Otherwise, do not commit or push.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal 42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
6. Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.
7. Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.
8. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
9. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
10. `[FIX_CODE]` is non-terminal. After completing these steps, iterate again with the same options to continue.
