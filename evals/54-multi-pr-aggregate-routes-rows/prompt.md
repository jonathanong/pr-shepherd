---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [multi-pr, aggregate, triage, wait, tier:discriminating, area:loop]
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
Shepherd PRs #42 and #43 through to a terminal state.
I already ran `pr-shepherd https://github.com/owner/repo/pull/42 https://github.com/owner/repo/pull/43 --until-terminal`
and it returned this summary. Take it from there.

---

# Poll summary [ACTIONABLE]

**repo** `owner/repo` · **selection** PRs #42, #43 · **mode** `summary`

## Pull requests

- [PR #42: Fix &lt;unsafe&gt; &amp; flaky CI](https://github.com/owner/repo/pull/42) [TRIAGE]
  - state `OPEN` · mergeable `MERGEABLE` · merge `UNSTABLE`
  - head `fix-ci` at `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` · base `main`
  - checks: 2 passing, 1 failing, 1 superseded, incomplete
  - review: 1 comment, 1 actionable, incomplete
  - reasons: `failing-checks`
  - pollCommand: `pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal`
- [PR #43: Draft follow-up](https://github.com/owner/repo/pull/43) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · flags `draft` · blocking reviewer `in progress`
  - head `follow-up` at `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` · base `fix-ci`
  - reasons: `blocking-reviewer-in-progress`

## Instructions

1. Choose each non-WAIT, non-CANCEL row that can proceed independently and run or delegate its exact `pollCommand`.
2. Follow each selected one-PR poll's `## Instructions` until it returns `CANCEL` or `ESCALATE`.
3. Run this aggregate poll again after selected work completes; one row's `ESCALATE` does not stop work on other rows.
