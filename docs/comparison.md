# Comparing pr-shepherd with other PR automation

[← docs index](README.md) | [README](../README.md)

pr-shepherd gathers a PR's state and emits one next action for a coding agent you already run. It does not provide a model, write a new review, edit code, mutate git, or run as a hosted service.

The alternatives fall into three groups:

1. [Cloud and vendor-bound agents](#1-cloud-and-vendor-bound-agents): one vendor hosts or owns the whole loop.
2. [Code Mode-style tools](#2-code-mode-style-tools): a CLI, MCP server, or bundled program computes PR state, and your agent acts on it. pr-shepherd is in this group.
3. [Skills only](#3-skills-only): a prompt tells the agent how to run the loop with `gh`.

Only tools built for this job are listed: babysitting, shepherding, or stewarding a PR. General agents and building blocks are left out, because they need a skill or instructions to do it: Claude Code Action, the GitHub MCP Server, and plain `gh` scripts. Review bots such as CodeRabbit, Cursor Bugbot, Qodo Merge, and Codex GitHub review are also left out. They write reviews; pr-shepherd works alongside them.

Each row states what the tool's own documentation says. Costs cover the product only; model usage, agent subscriptions, and Actions minutes are separate.

## 1. Cloud and vendor-bound agents

These need no local session, or come built into one vendor's agent. The trade is lock-in: the vendor's model, plan, and GitHub integration.

| Tool                                                                                                                             | Runs as                                         | What it does on a PR                                                                             | Merges                                 | Bound to                                     | Cost                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------- | -------------------------------------------- | ------------------------------------ |
| [**Claude PR Steward**](https://code.claude.com/docs/en/pr-steward)                                                              | Claude GitHub App, one cloud session per PR     | Pushes fixes for review feedback, failing checks, and conflicts; replies to and resolves threads | No: "designed not to approve or merge" | Claude Team or Enterprise plan (public beta) | Tokens billed to the organization    |
| [**GitHub Copilot CLI `/pr auto`**](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/manage-pull-requests) | Local Copilot CLI (not cloud, but Copilot only) | Feedback, conflicts, CI, commits, pushes                                                         | See its docs                           | Copilot                                      | Copilot plans, including a free tier |

pr-shepherd is the local, harness-agnostic counterpart to PR Steward. The differences that matter:

- **Who acts.** PR Steward commits as `Claude <noreply@anthropic.com>` through the Claude GitHub App. With pr-shepherd, your own agent commits as you.
- **When it starts.** PR Steward starts on PR open or `@claude steward`, with no session open. pr-shepherd runs when a caller invokes it.
- **How far it goes.** PR Steward stops at pushed fixes. pr-shepherd continues through merge, the merge queue, and stacks when you ask.
- **Visibility.** PR Steward labels the PR while it watches and works, and posts progress comments. pr-shepherd leaves no marker on the PR beyond its commits and replies. To add labels or progress comments, wrap the skill in your own skill that sets them.

## 2. Code Mode-style tools

A program reads GitHub and returns compact state; the agent decides and acts. The program is the same on every run, and it costs no model tokens to compute.

| Tool                                                                                                                                       | Layer                                      | Output                                                            | Review items                                                                    | CI                                                           | Mutations                                     | Merge, queue, stacks                                  | Waiting                                                                          | Forges         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| **pr-shepherd**                                                                                                                            | CLI and thin skill; optional stdio MCP     | One action with numbered instructions; JSON or Markdown           | Every thread and comment shown once, including outdated, resolved, and edited   | Failed step, summary, log excerpt; reruns; unreported checks | Reply, resolve, minimize, dismiss, mark ready | Merge, enqueue, queue ejections, native GitHub stacks | Background CLI process that wakes the agent on exit; optional webhook events     | GitHub         |
| [**goodtogo (`gtg`)**](https://github.com/dsifry/goodtogo)                                                                                 | Python CLI                                 | One readiness status; text or JSON                                | Classifies comments as actionable, non-actionable, or ambiguous                 | Aggregates checks into pass, fail, or pending                | None documented                               | None documented                                       | None; one read per call                                                          | GitHub         |
| [**babysit**](https://github.com/volker48/babysit)                                                                                         | Rust CLI plus a companion skill            | `status`, `findings`, `wait`; exit codes                          | Distills review threads from selected bots into findings                        | Waits until checks settle                                    | None documented                               | None documented                                       | `wait` command with a timeout; optional webhook gateway                          | GitHub, GitLab |
| [**pr-ready-mcp**](https://github.com/fabriciopirini/pr-ready-mcp)                                                                         | Read-only MCP server                       | A verdict tied to a head SHA; each reason has a code and an owner | Review requirement reported as a reason                                         | Checks on the head commit                                    | None (read-only)                              | Reports merge-queue state                             | None documented                                                                  | GitHub         |
| [**pr-review-mcp**](https://github.com/thebtf/pr-review-mcp)                                                                               | MCP server, 19 tools                       | Normalized findings from seven AI reviewers                       | Lists findings, invokes reviewers, waits for them server-side, resolves threads | None documented                                              | Resolve threads, labels, reviewers, create PR | `pr_merge` tool                                       | `pr_await_reviews` blocks one MCP tool call until reviewers post or it times out | GitHub         |
| [**Compound Engineering `ce-babysit-pr`**](https://github.com/EveryInc/compound-engineering-plugin/blob/main/docs/guides/ce-babysit-pr.md) | Skill with a bundled `pr-snapshot` program | Per-tick attention set; a token-free `watch` that wakes the agent | Paginates review threads; fixes go to its `/ce-resolve-pr-feedback` skill       | Records CI; real failures go to its `/ce-debug` skill        | Through its other skills                      | `gh stack merge`, only in its `stack-land` posture    | `pr-snapshot watch` polls outside the model and wakes the agent                  | GitHub         |

pr-shepherd was inspired by goodtogo, whose repository was last pushed on 2026-02-18. goodtogo, babysit, and pr-ready-mcp return a verdict or a list of findings. pr-review-mcp covers AI-review feedback and can merge, but documents nothing for CI. `ce-babysit-pr` is the closest in scope: a bundled program snapshots the PR and wakes the agent, while the loop, the fixes, and stack handling live in its skill and twelve reference files. pr-shepherd returns the next step with numbered instructions, generates the review mutations, and carries the PR through merge, the merge queue, and stacks from one program.

Waiting is where an MCP-only tool is weakest. An MCP tool call blocks the agent's turn, so a wait either stalls the agent or hits the client's tool timeout, and a tick per call costs a full GitHub fetch each time. SSE responses and MCP progress notifications are not shown to the model, so streaming does not help. For that reason the pr-shepherd plugin stopped starting its MCP server and waits in a background CLI process; the server remains available to register yourself ([mcp.md](mcp.md#why-the-plugin-does-not-start-it)).

Both pr-shepherd and babysit can wait on GitHub webhook events instead of a timer: pr-shepherd through a [hook-harness](hook-harness.md) relay, babysit through a Cloudflare Worker gateway you deploy.

## 3. Skills only

A skill is a prompt. The agent rebuilds PR state on every pass with `gh` calls, so each pass spends model tokens on fetching and filtering, and two runs over the same PR can take different paths. A skill that bundles a helper script moves part of that work out of the model.

| Tool                                                                                                          | Works in         | Loop                                                                                     | Bundled scripts   | Merge and stacks                   |
| ------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- | ----------------- | ---------------------------------- |
| [**Cursor `/autopilot`**](https://cursor.com/docs/skills)                                                     | Cursor           | Built-in skill that polls `gh`; the agent rebuilds state each pass                       | None              | See its docs                       |
| [**review-skills `babysit-pr`**](https://github.com/amElnagdy/review-skills)                                  | Any coding agent | Verifies each finding, fixes, replies, resolves, and re-runs its paired two-model review | One thread script | Reports merge readiness; you merge |
| [**claude-mem `babysit`**](https://github.com/thedotmack/claude-mem/blob/main/plugin/skills/babysit/SKILL.md) | Claude Code      | One prompt: poll checks, read new comments, fix, push, repeat                            | None              | None documented                    |

Do not attach `/autopilot`, or a `gh pr checks --watch` skill, in the same session as pr-shepherd. The two loops fight over CI waits, comment filters, and the next step.

## Where pr-shepherd differs

- **A program, not a prompt.** Shepherd returns raw-enough fields plus one action and numbered instructions. The agent still decides what needs a code change.
- **Carries existing reviewer intent.** Review bots create new findings. Shepherd surfaces every existing item at least once, including outdated, resolved, minimized, and later-edited ones. The exception is a `COMMENTED` review minimized before the first tick. See [handled-cases.md](handled-cases.md).
- **Leaves judgement and git with the caller.** Shepherd never runs mutating git commands or silently applies changes.
- **Portable.** The same action model is available through the CLI and MCP, so Claude Code, Codex, Grok, and other clients can use it. The client owns recurrence; there is no hosted background worker.
- **Measured.** Decisions, token cost, and GitHub quota are benchmarked against `gh` and the GitHub MCP server ([outcome evals](../evals/README.md), [token bench](../evals/tokens/README.md)). None of the tools in the tables above were run in those benchmarks.
- **One caller-side constraint.** The always-on untrusted-input rule treats titles, comments, and logs as data. It does not classify nits or add an escalation trigger.

## When pr-shepherd is not the right fit

- You want a prompt with no CLI.
- You mainly want a new AI review.
- You want one vendor to edit, commit, push, and host the whole loop.
- You need a background service that reacts to GitHub events without an active caller.
- You need GitLab, Bitbucket, Azure DevOps, or another non-GitHub forge.

## Sources

Cloud and vendor-bound: [Claude PR Steward](https://code.claude.com/docs/en/pr-steward), [GitHub Copilot CLI pull-request management](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/manage-pull-requests).

Code Mode-style: [goodtogo](https://github.com/dsifry/goodtogo), [babysit](https://github.com/volker48/babysit), [pr-ready-mcp](https://github.com/fabriciopirini/pr-ready-mcp), [pr-review-mcp](https://github.com/thebtf/pr-review-mcp), [Compound Engineering `ce-babysit-pr`](https://github.com/EveryInc/compound-engineering-plugin/blob/main/docs/guides/ce-babysit-pr.md).

Skills only: [Cursor Agent Skills](https://cursor.com/docs/skills) (`/autopilot` is a built-in skill), [review-skills](https://github.com/amElnagdy/review-skills), [claude-mem](https://github.com/thedotmack/claude-mem).
