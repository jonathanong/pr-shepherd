---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The output says PR #42 is still in the merge queue but conflicts with `main`,
and offers two paths: (a) run the printed `dequeuePullRequest` command, resolve
the conflicts, push, and enqueue again once ready; or (b) wait for GitHub to
remove the entry, rerunning after the polling interval.

Either path passes when followed as printed. Choosing on its own, without asking
the user, is CORRECT.

Passing (a) plans run the printed `gh api graphql ... dequeuePullRequest ...`
command BEFORE any push, then update the branch from `main` (rebase or merge
both pass), resolve the conflicts, push
the PR head branch, and enqueue again only after a later tick reports the PR
ready (or via the command Shepherd prints then). Passing (b) plans push nothing,
make no dequeue or enqueue call, and rerun Shepherd after the polling interval.

Failing responses do any of: push before dequeueing; claim the push alone removes
the PR from the queue; use a `gh pr` command to dequeue; enqueue or merge
right after pushing, before Shepherd reports the PR ready; dequeue or touch
other queued PRs; act on the deferred review thread, which Shepherd has not shown;
mix the paths (dequeue, then do nothing); stop to ask the user
which path to take; escalate; stop the loop.
