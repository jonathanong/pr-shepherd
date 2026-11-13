---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [triage, conflicts, merge-queue, tier:discriminating, area:github]
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
Shepherd https://github.com/owner/repo/pull/42 and merge it. I already ran the first tick
(`pr-shepherd https://github.com/owner/repo/pull/42 --until-terminal --merge`) — here is what it returned.
Take it from there.

---

# PR #42 [TRIAGE]

**status** `FAILING` · **merge** `DIRTY` · **repo** `owner/repo`
**summary** 1 passing · **branch** conflicts with PR base `main`
Merge queue: position 2 UNMERGEABLE [Required]
**merge queue** enabled `true` · inQueue `true` · state `UNMERGEABLE` · position `2`

**deferred (in merge queue)** 1 thread

## Instructions

1. The branch has merge conflicts (see `**branch**` above). The PR is still in the merge queue, but GitHub cannot merge it until the conflicts are resolved. Choose one path: (a) pull it from the queue and resolve now — first run `gh api graphql -f 'query=mutation DequeuePullRequest($id: ID!) { dequeuePullRequest(input: { id: $id }) { mergeQueueEntry { id } } }' -f id=PR_kwDOAAAAAAA` (`gh pr` cannot remove a queue entry); only this PR leaves the queue and the other entries stay queued; then: Update per the repo's instructions, keeping both sides' changes. Once the PR is ready again, enqueue it again (with `--merge`, Shepherd prints the enqueue command). Or (b) wait — skip the dequeue and every step marked `If you chose (a):`, and rerun Shepherd after the polling interval instead of immediately, until GitHub removes the entry itself; this step repeats until then, and an unchanged conflict escalates through `stall-timeout`. On either path, review items stay deferred until the PR leaves the queue.
2. If you chose (a): Commit any remaining conflict-resolution changes and push to the PR head branch.
3. If you chose (a), rerun Shepherd now. If you chose (b), rerun Shepherd after the polling interval.
