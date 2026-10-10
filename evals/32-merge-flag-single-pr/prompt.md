---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [merge, tier:discriminating]
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
Shepherd https://github.com/owner/repo/pull/42 and merge it. I already ran the first tick
(`pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal --merge`) — here is what it returned.
Take it from there.

---

# PR #42 [MERGE]

**status** `READY` · **repo** `owner/repo`
**summary** 1 passing

## Merge command

- auto-merge: `gh pr merge 42 --repo owner/repo --match-head-commit abc123 --auto --merge`
- plain merge fallback: `gh pr merge 42 --repo owner/repo --match-head-commit abc123 --merge`

## Instructions

1. Run the `auto-merge` command shown above exactly as printed.
2. Only if GitHub reports that auto-merge is unavailable, run the `plain merge fallback` command shown above.
3. Then iterate immediately with the same options to monitor until the PR merges or needs work.
