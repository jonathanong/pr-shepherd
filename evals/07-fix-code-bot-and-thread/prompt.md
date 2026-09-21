---
model: claude-opus-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [fix_code]
append_system_prompt: |
  You have no shell, no network access, and no repository checkout in this
  environment. Do not attempt to run shell commands, read repository files, or
  fetch anything over the network, and do not ask for the repository to be
  provided.

  You MAY use any skill available to you. If a skill is relevant to this request,
  load it before you plan.

  State the plan you would execute, as concrete numbered steps that someone could
  follow without you. Where a step runs a command, give the exact command. Where
  you decide NOT to take an action that the output appears to offer, say so
  explicitly and say why.
---
PR #42 is blocked and I need it moving again. I ran pr-shepherd on
https://github.com/owner/repo/pull/42 and got this back — what do we do now?

---

# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_thrash_84](https://github.com/owner/repo/pull/42#discussion_r10) — `src/auth.ts:88` (@reviewer · User)

> This authentication logic is too complex, please simplify.

## Changes-requested reviews

- `reviewId=PRR_bot_overdue_84` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_thrash_84 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_overdue_84 --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads`, `## Changes-requested reviews` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. Read every body under `## Changes-requested reviews` and apply any warranted change.
4. If you changed code, commit any remaining changes and push to the PR head branch, then run the remaining review mutations using the pushed commit SHA and iterate immediately with the same options. If you did not change code, do not commit and continue with the remaining steps.
5. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
6. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, commit and push to the PR head branch first, then replace `$HEAD_SHA` with the pushed commit SHA.
7. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
8. Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.
9. `[FIX_CODE]` is non-terminal: if you changed code, commit and push to the PR head branch, then run the review mutations using the pushed commit SHA and iterate immediately with the same options; if you did not change code, complete the authorized review mutations and iterate immediately with the same options.
