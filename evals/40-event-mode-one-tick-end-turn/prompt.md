---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [event-mode, wait, tier:guard]
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
returned the output below. Take it from there.

---

# PR #42 [WAIT]

**status** `IN_PROGRESS` · **repo** `owner/repo` · **pollMode** `event`
**summary** 1 inProgress
**activity** 0 commits · 0 review rounds · active: `CI / build`
**nextCheck** `2024-05-15T19:57:00Z` · in 3020s · reason `safety-net`

WAIT: 1 in-progress — active checks: CI / build

## Instructions

1. Non-terminal — no action needed this tick.
2. Event mode: end this turn now without sleeping or polling. Playbook: "Cloud event loop".
3. Keep exactly one safety-net wake-up at `2024-05-15T19:57:00Z` (`safety-net`). When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload.
