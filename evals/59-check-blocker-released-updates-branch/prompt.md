---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [triage, check-blocker, ci-triage, tier:discriminating, area:github]
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
  explicitly and say why. The plan is the deliverable: do not ask for a shell or
  for command output to be pasted back.
---
Shepherd https://github.com/owner/repo/pull/42 through to a terminal state. I already ran the first tick —
here is what it returned. Take it from there.

---

# PR #42 [TRIAGE]

**status** `FAILING` · **merge** `BEHIND` · **repo** `owner/repo`
**branch** behind PR base `main`

## Failing checks

- `34906500059` — `Benchmarks › Benchmarks` [conclusion: FAILURE]
  > Check benchmark results
  > Benchmark build or execution failed.
  > ##[error]Process completed with exit code 1.

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Commit and push any changes.
4. Update this PR branch from its base with `gh pr update-branch 42 --rebase`. Do not rerun the job; a rerun retests the old merge ref.
5. Rerun Shepherd now.
