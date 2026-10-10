---
model: claude-sonnet-5-5
runs: 3
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [fix-code, conflicts, native-stack, merged-parent, tier:guard]
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
Shepherd https://github.com/vouchington/vouchington/pull/2547 through to a terminal state.
This PR is the lowest open layer in native stack #2535. PRs #2509 and #2534
have merged, but #2547 still targets #2534's old head branch. The remaining
open layers are #2547, #2569, #2627, and #2629. GitHub rejects changing a
native-stack PR's base with gh pr edit. I have not asked you to merge or
enqueue the stack. Here is Shepherd's current output.

---

# PR #2547 [FIX_CODE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `vouchington/vouchington`
**branch** conflicts with stack trunk `main`
Stack: 2535 (layer 3/6, base main)

## Instructions

1. The branch has merge conflicts (see `**branch**` above). From a clean checkout of `vouchington/vouchington`, if `gh stack` does not track stack #2535 locally, import it with `gh stack checkout 2535`. Then check out the head branch of PR #2547 and run `gh stack rebase`. Playbook: "Branch update".
2. Commit any remaining changes on the PR head branch and push the rewritten stack with `gh stack push`.
3. `[FIX_CODE]` is non-terminal. Rerun the same command now.
