---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [escalate, merge-queue, ci-triage, tier:discriminating]
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

# PR #42 [ESCALATE]

**status** `FAILING` · **repo** `owner/repo`
**summary** 2 passing
Required status checks: web [Required]
Merge queue: No [Required]
**merge queue** enabled `false` · inQueue `false` · checkCommit `queue-commit-1`
**queue removal** reason `failed_checks` · createdAtUnix `1715799000` · actor `@github-actions` · commit `queue-commit-1` · parents `abc123`

⚠️ /pr-shepherd:pr-shepherd paused — manual intervention required

**Triggers:** `check-follow-up-unavailable`

One or more failing checks have no autonomous follow-up available. Use the displayed conclusion, run or URL, and included evidence to handle them manually.

## Items needing attention

- run `200`, URL `https://github.com/owner/repo/actions/runs/200/job/200` — `web › web` [conclusion: CANCELLED], scope `merge_group` at `queue-commit-1`


---

After completing manual fixes (and pushing if required), rerun `/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42 --merge` to resume.

## Instructions

1. Stop — human direction is required before automated polling can resume.
