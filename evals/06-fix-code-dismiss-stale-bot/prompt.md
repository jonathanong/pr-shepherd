---
model: claude-opus-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [fix_code]
append_system_prompt: |
  You have no shell and no network access. Do not run shell commands, fetch
  anything over the network, or read repository files other than a reference
  file linked from a skill you loaded. Do not ask for the repository to be provided.

  You MAY use any skill available to you. If a skill is relevant to this request,
  load it before you plan. If that skill points at a reference file, read it
  before you plan.

  State the plan you would execute, as concrete numbered steps that someone could
  follow without you. Where a step runs a command, give the exact command. Where
  you decide NOT to take an action that the output appears to offer, say so
  explicitly and say why.
---
Shepherd https://github.com/owner/repo/pull/42 through to a terminal state. I already ran the first tick —
here is what it returned. Take it from there.

---

# PR #42 [FIX_CODE]

**status** `PENDING` · **merge** `BLOCKED` · **reviewDecision** `CHANGES_REQUESTED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Changes-requested reviews

- `reviewId=PRR_bot_overdue` (@claude · Bot) [pending dismissal — already surfaced; include in `--dismiss-review-ids`]

### `reviewId=PRR_bot_new` (@claude · Bot)

> A newer changes-requested review that must be displayed before its retained dismissal runs.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --message "$DISMISS_MESSAGE" --dismiss-review-ids PRR_bot_overdue,PRR_bot_new --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Changes-requested reviews` and decide whether it needs a code change.
2. Read every body under `## Changes-requested reviews` and apply any warranted change.
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. Playbook: "Shepherd Journal".
5. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
6. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
7. Run the `apply review:` command above. Playbook: "Review-mutation mechanics".
8. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
