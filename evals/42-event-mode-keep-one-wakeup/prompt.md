---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [event-mode, scheduling]
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
You are running in a Claude Code cloud session subscribed to PR activity for
https://github.com/owner/repo/pull/42. I already ran `pr-shepherd https://github.com/owner/repo/pull/42` — it was configured for event mode and
returned the output below.

Earlier in this session you scheduled a wake-up for 2024-05-15T19:57:00Z. A PR event
woke you, and I reran `pr-shepherd https://github.com/owner/repo/pull/42`, which returned:

---

# PR #42 [READY]

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo` · **pollMode** `event`
**summary** 1 passing · **remainingSeconds** 127
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]
**nextCheck** `2024-05-15T19:09:00Z` · in 140s · reason `ready-delay`

READY: PR #42 is ready — 127s of ready-delay remaining — 1 passing, 0 in-progress

## Instructions

1. PR #42 is ready. Ready-delay has 127s left. Do not invent unrelated work.
2. Event mode: end this turn now without sleeping or polling. Playbook: "Cloud event loop".
3. Keep exactly one wake-up at `2024-05-15T19:09:00Z` (`ready-delay`). When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload.

Which wake-ups should be scheduled now?
