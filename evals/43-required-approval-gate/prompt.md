---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [ready, mergeability, tier:discriminating]
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
PR #42 is blocked and I need it moving again. I ran pr-shepherd on
https://github.com/owner/repo/pull/42 and got this back — what do we do now?

---

# PR #42 [READY]

**status** `READY` · **merge** `BLOCKED` · **reviewDecision** `REVIEW_REQUIRED` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing · **remainingSeconds** 300
Approvals: None [Required]
Conversations Resolved: Yes [Not Required]

READY: PR #42 is ready — 300s of ready-delay remaining — 1 passing, 0 in-progress — awaiting 1 approval

## Instructions

1. PR #42 is ready. Ready-delay has 300s left. Rerun this command when the timer elapses. Do not invent unrelated work.
