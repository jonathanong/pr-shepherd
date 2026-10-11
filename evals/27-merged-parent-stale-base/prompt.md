---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [fix-code, conflicts, merged-parent, tier:guard]
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
Shepherd https://github.com/vouchington/vouchington/pull/2099 through to a terminal state.
This is the final layer after PR #2095 merged. PR #2099 still targets
`knip-exports-retentions`, #2095's old head branch. I verified with GitHub's
compare API that #2099's head contains current `main` (2 ahead, 0 behind),
while it diverges from the old base (4 ahead, 7 behind). I have not asked you
to merge or enqueue the PR. Here is Shepherd's current output.

---

# PR #2099 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY`
**branch** conflicts with PR base `knip-exports-retentions`

## Merged PRs matching the current base

- [#2095](https://github.com/vouchington/vouchington/pull/2095) · state `MERGED` · head `knip-exports-retentions` at `ed48e5c203b16eaf6037da2f3c64641912918804` · base `main` · mergedAt `2026-10-07T04:44:56Z` · headRepository `vouchington/vouchington`

## Instructions

1. Inspect every PR under `## Merged PRs matching the current base`. If this PR is the remaining layer intended for a merged parent's base branch, run `gh pr edit https://github.com/vouchington/vouchington/pull/2099 --base <verified-parent-base>` after replacing `<verified-parent-base>` with that parent's shell-quoted base branch, then rerun Shepherd immediately and follow its fresh instructions instead of the remaining steps here. Otherwise keep the current base and follow the remaining conflict-resolution steps.
2. The branch has merge conflicts (see `**branch**` above). Resolve them before committing.
3. Commit any remaining conflict-resolution changes and push to the PR head branch.
4. Rerun Shepherd now.
