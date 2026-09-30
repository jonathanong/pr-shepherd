---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [fix-code, ci-triage]
env:
  CLAUDE_CODE_EFFORT_LEVEL: low
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

**status** `FAILING` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 0 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Failing checks

- `27325033780` — `CI › tests` [conclusion: FAILURE] [rerun authorized]
  > All checks passed
  > One or more required jobs failed or were cancelled
  > ##[error]Process completed with exit code 1.
  > Job results (non-success):
  > test-playwright: failure
  > test-playwright-credentialed: failure
  rerun: `gh run rerun 27325033780 -R owner/repo`

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Failing checks` and decide whether it needs a code change.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. If you changed code, commit any remaining changes and push to the PR head branch. If you did not, do not commit.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. Playbook: "Shepherd Journal".
5. `[FIX_CODE]` is non-terminal. Iterate immediately with the same options.
