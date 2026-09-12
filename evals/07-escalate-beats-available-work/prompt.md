---
model: claude-opus-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [escalate]
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

# PR #42 [ESCALATE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `bot-cr-not-dismissed`

Bot CHANGES_REQUESTED review(s) remained undismissed past the stall window (review IDs: PRR_bot_overdue_84). The agent likely dropped `--dismiss-review-ids` from a prior apply command. Dismiss the review(s) manually (or re-run `pr-shepherd apply review` with the IDs) to unblock the PR.

## Items needing attention

- thread `PRRT_thrash_84` — `src/auth.ts:88` (@reviewer · User):

  > This authentication logic is too complex, please simplify.

- review `PRR_bot_overdue_84` (@claude · Bot):

  > ## Summary
  > 
  > Here are some blockers I found:
  > 
  > 1. **Missing input validation.** The `processPayment` function at `src/payments.mts:42` does not validate the amount field before passing it to the charge API.


## Pending review commands

- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_thrash_84 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_overdue_84 --require-sha "$HEAD_SHA"`

---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42` to resume.

## Instructions

1. Stop polling. Ask the user whether to run the pending review commands shown above.
2. If yes, replace any `$HEAD_SHA` with the full 40-character pushed PR-head SHA and any `$DISMISS_MESSAGE` with a one-sentence disposition, run every pending command, then rerun Shepherd with the same options.
