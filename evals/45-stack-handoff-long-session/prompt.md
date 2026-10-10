---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [stack, shepherd, escalate, multi-turn, tier:discriminating]
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
The conversation so far is replayed below, oldest turn first. Each `[tool]`
turn shows a command you ran earlier in this session and what it printed.

---

[user]

Shepherd https://github.com/owner/repo/pull/42 until it's ready for review.

---

[tool] $ pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal

# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: No [Not Required]

## Review threads

### [threadId=PRRT_active](https://github.com/owner/repo/pull/42#discussion_r1) — `src/index.ts:42` (@reviewer · User)

> Please rename this variable to be more descriptive.

## Post-fix actions

- base: `main`
- apply review: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_active --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`

## Instructions

1. Review each item under `## Review threads` and decide whether it needs a code change.
2. Apply every warranted review fix in each file referenced above.
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. Playbook: "Shepherd Journal".
5. If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.
6. Replace `$DISMISS_MESSAGE` with one sentence describing what changed.
7. Run the `apply review:` command above. Playbook: "Review-mutation mechanics".
8. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.

---

[assistant]

Renamed the variable in `src/index.ts`, committed, pushed `5d1e0a7` and ran
the printed `apply review:` command (it replied to `PRRT_active`). Iterating.

---

[tool] $ pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal

# PR #42 [MARK_READY]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing · **remainingSeconds** 300 · **isDraft**
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

MARKED READY: PR #42 converted from draft to ready for review

## Instructions

1. The CLI marked the PR ready for review. Iterate immediately with the same options to continue.

---

[assistant]

The CLI marked #42 ready for review. Iterating.

---

[tool] $ pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal

# PR #42 [CANCEL] — ready-delay-elapsed

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

CANCEL: PR #42 has been ready for review — ready-delay elapsed, stopping

## Instructions

1. Stop polling this pull request — its poll is complete.
2. Continue any remaining pull requests or issues from the original request.

---

[assistant]

PR #42 is ready for review and its loop has ended. Nothing else was requested.

---

[user]

Thanks. Now shepherd the native PR stack anchored at https://github.com/owner/repo/pull/403.

---

[tool] $ pr-shepherd --stack https://github.com/owner/repo/pull/403 --until-terminal

# owner/repo stack #40 — actionable

Stack: #40 · anchor PR #403 · 3 layers · mode `summary`
stackMergeable: false
nextAction: shepherd

## Layers

- [PR #401: Human handoff](https://github.com/owner/repo/pull/401) — not shepherded · not mergeable (`mark-ready-authorization-required`)
  - OPEN · draft · position 1/3 · base `main`
- [PR #402: Independent review work](https://github.com/owner/repo/pull/402) — not shepherded · mergeable · owned
  - OPEN · position 2/3 · base `foundation`
- [PR #403: Pending CI](https://github.com/owner/repo/pull/403) — not shepherded · not mergeable (`checks-in-progress`) · owned
  - OPEN · position 3/3 · base `review-work` · 1 in progress

## Instructions

1. Start or delegate one-PR sessions only for rows marked `owned`. Leave every other author's layer untouched. Owned layers can proceed concurrently.
2. Run `pr-shepherd https://github.com/owner/repo/pull/402 --until-terminal` for PR #402.
3. Run `pr-shepherd https://github.com/owner/repo/pull/403 --until-terminal` for PR #403.
4. PR #401 requires human action (mark-ready-authorization-required). Keep shepherding other PRs before the handoff.
5. After the listed one-PR sessions, rerun this same `--stack` selector. Stop for the human handoff only when no autonomous shepherding remains.
