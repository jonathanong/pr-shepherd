---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [cancel, multi-pr]
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
Earlier I asked you to "make PRs for issues #101 and #102 and shepherd them".
You opened https://github.com/owner/repo/pull/42 and https://github.com/owner/repo/pull/43, then started
`pr-shepherd <url> --until-terminal` in the background for each.

Background task finished: `pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal`

---

# PR #42 [CANCEL] — ready-delay-elapsed

**status** `READY` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

CANCEL: PR #42 has been ready for review — ready-delay elapsed, stopping

## Instructions

1. Stop — the PR loop is complete. No further polling is needed.
