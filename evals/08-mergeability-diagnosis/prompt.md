---
model: claude-opus-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [fix-code, mergeability]
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

**status** `UNRESOLVED_COMMENTS` · **merge** `CLEAN` · **state** `OPEN` · **repo** `owner/repo`
**summary** 1 passing
Approvals: None [Not Required]
Conversations Resolved: Yes [Not Required]

## Changes-requested reviews

### `reviewId=PRR_prlevel` (@architect · User)

> The overall architecture needs to be reconsidered before merging.

## Post-fix actions

- base: `main`

## Instructions

1. Review each item under `## Changes-requested reviews` and decide whether it needs a code change.
2. Read every body under `## Changes-requested reviews` and apply any warranted change.
3. If you changed code, commit any remaining changes and push to the PR head branch, then run the remaining review mutations using the pushed commit SHA and iterate immediately with the same options. If you did not change code, do not commit and continue with the remaining steps.
4. For any substantial decision or rejection, append `- <decision>` to Shepherd Journal with `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <decision>'`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.
5. `[FIX_CODE]` is non-terminal. After completing these steps, iterate immediately with the same options to continue.
