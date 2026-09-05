---
title: "Never mutate git"
description: "Shepherd emits the commit, push, and merge commands; it never runs them. The calling agent already owns the git lifecycle."
order: 4
docs:
  - path: "CLAUDE.md#git-operations"
    label: "CLAUDE.md — the read-only git rule, in full"
  - path: "docs/features.md"
    label: "features.md — 'does not modify files or mutate git' as a non-goal"
---

# Never mutate git

Every `git` invocation Shepherd's own CLI makes is read-only: `status`, `rev-parse`,
`log`, `diff`, `remote get-url`, `for-each-ref`. It never runs `add`, `commit`, `apply`,
`checkout --`, `reset`, `rebase`, `merge`, `push`, `fetch`, `pull`, `stash`, `restore`,
`switch`, `cherry-pick`, `revert`, `am`, or `config --set`.

This isn't caution for its own sake. It's a specific, previously-learned failure mode:

> Mutating `git` subprocesses can leave `.git/index.lock` behind on hook failure, breaking
> every subsequent operation in the worktree until cleaned up by hand. The calling agent
> already owns the git lifecycle and has the retry / cleanup / sandbox-bypass machinery to
> handle this correctly.

A tool that shells out to `git commit` on your behalf either owns that lock file's failure
modes too, or it doesn't and you find out at the worst time. Shepherd sidesteps the whole
class of problem by never taking the lock in the first place.

## Emit, don't execute

Where a git or GitHub mutation is genuinely the next step, Shepherd builds the exact
command and hands it back instead of running it:

- **Fixes** get a rendered `apply review` command — resolve, reply, minimize, and dismiss
  arguments already filled in from the batch it just fetched.
- **Suggestion patches** are built from the PR's actual head blobs and dry-run verified
  with `git apply --check` against a clean descendant of that head — but never written to
  a file or applied. `build_suggestion_patches` returns nothing unless the whole ordered
  stream passes.
- **Merges** get a head-pinned `gh pr merge --auto` (or a queue command, with a direct
  GraphQL `enqueuePullRequest` fallback for a known `gh` CLI queue limitation). Shepherd
  builds the command; GitHub is authoritative for whether it succeeds.

In every case, the output is inert until the calling agent — or you — decides to run it.

## Why this belongs on the agent

The agent already has retry logic, sandbox-bypass handling, and cleanup for its own git
operations, because it has to: it's the thing actually managing the working tree across a
whole session, not just one tool call. Duplicating that machinery inside Shepherd would
mean two systems with opinions about the same lock file. Keeping git mutation entirely on
one side of that boundary is what makes the boundary safe to reason about.
