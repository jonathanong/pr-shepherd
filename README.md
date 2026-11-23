# pr-shepherd

Take pull requests from scratch to merge-ready with a coding agent, as a [Code Mode-style](https://code.claude.com/docs/en/code-mode) plugin. It works with Claude Code, Codex, and Grok.

## Benefits

- **Better decisions:** across 71 PR states, it scores 0.95 with the plugin vs. 0.57 with `gh` + the GitHub MCP server ([outcome evals](evals/README.md), 2026-11-23).
- **Lower cost:** modeled cost per PR session is about 34% lower than `gh` and 75% lower than the GitHub MCP server, with 18% / 69% fewer turns ([token bench](evals/tokens/README.md); assumes a warm prompt cache).
- **More PRs on one GitHub quota:** 65% fewer GraphQL points than `gh` per PR session. While CI runs, a 5,000-point hourly budget covers about 80 waiting PRs, vs. about 13 with `gh pr checks --watch` ([GitHub API](docs/github-api.md), [GraphQL usage](docs/graphql-usage.md)). A [GitHub App](docs/github-app.md) and [webhook events](docs/hook-harness.md) cut it more.
- **76 GitHub edge cases handled:** outdated or resolved threads are still shown once, edited comments come back, and conflicts that GraphQL reports as `CLEAN` are caught ([handled cases](docs/handled-cases.md)).
- **Tidy PRs, less context:** bot and outdated comments are triaged and resolved, human reviews get replies, and known bot noise is minimized and filtered out before it reaches the agent.
- **Review hygiene:** it never answers its own replies or minimizes human comments, skips a denied reply once, and hands a repeatedly rejected fix to a human ([comments and reviews](docs/handled-cases.md#comments-and-reviews)).
- **CI failures, pre-read:** each failing check comes with its failed step, summary, and log excerpt, so the agent rarely fetches logs. Superseded runs, unstarted required checks, and approval gates are recognized ([failing checks](docs/actions.md#failing-checks-and-reruns), [CI cases](docs/handled-cases.md#ci-checks)).
- **Cheaper CI:** names the in-progress runs a fix push would cancel anyway.
- **Why a PR can't merge:** prints the actual branch protection and ruleset requirements, such as `Approvals: None [Required]` ([merge requirements](docs/merge-status.md#merge-requirements)). Merges are pinned to the head the agent checked, and a PR a maintainer pulled from the queue is not requeued ([merge and queue](docs/handled-cases.md#merge-and-queue)).
- **Full flow:** draft to mergeable to merged, through the merge queue and stacks. Suggested changes become commits that credit the reviewer.
- **Safe by construction:** the CLI never mutates git or merges by itself, and human handoff is limited to a [short list](docs/escalations.md).

## Use cases

- **Autonomous agents.** An agent opens a PR and drives it to merge-ready, or merged when you allow it, with nobody watching CI and reviews.
- **Exhaustive AI code review.** For PRs with many bot reviews (CodeRabbit, Codex, Copilot), Shepherd shows every thread and comment once, tracks first-look, edited, and outdated items, and batches replies, resolves, and minimizes.
- **High-velocity teams.** Stacked PRs, merge queues, and ejections are supported, and agents are told to rebase or stack as needed, so work keeps moving.

## How to use

[Install](#install) the plugin, then ask your agent:

- **"make PRs, /pr-shepherd:pr-shepherd"** makes one PR per separately reviewable change, stacks a PR on an earlier one when it needs that PR's code or edits the same lines, and shepherds every PR until it is mergeable.
- **`/pr-shepherd <PR>`** takes a PR, including a draft, to mergeable without merging. Omit the PR to use the current branch.
- **`/pr-shepherd <PR1> <PR2>`** shepherds several PRs, returning when any needs action.
- **`/pr-shepherd --merge <PR>`** takes the PR to mergeable and merges it.
- **`/pr-shepherd stack <stack#> --merge`** shepherds a native stack and merges it all at once when it is ready. `--merge-through <PR>` merges up to that layer, and `--merge-ready` merges the bottom layers as they become ready. Listing PR numbers instead of the stack number owns only those layers.

In Codex, use `$pr-shepherd`. In a shell or CI, run `pr-shepherd <PR>`.

Then run **`/pr-shepherd:setup-pr-shepherd`** (Codex: `$setup-pr-shepherd`) to scan recent PRs for recurring bot noise and configure `.pr-shepherdrc.yml`, or edit it by hand ([configuration](docs/configuration.md)):

- turn on the bundled classification rules to hide known bot comments, or add your own ([examples](examples/classification/));
- list code-review workflows in `checks.never-cancel` so they always finish.

```yaml
version: 1
classify:
  standard:
    all: true
checks:
  never-cancel:
    - "*review*"
```

Optionally, put your policy ("reply instead of fixing nits", "never merge") in a skill that wraps the shipped one ([skills](docs/skills.md)).

## What it does

Shepherd gathers the full PR context (reviews, CI failures, merge requirements) in one call and returns one action with numbered instructions and exact commands, so the agent needs fewer tokens, calls, and turns.

```text
$ pr-shepherd 123

# PR #123 [TRIAGE]

## Review threads

### `threadId=PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate/index.mts:42` (@alice · MEMBER)

> The variable name is misleading.

## Instructions

1. Fix each warranted item.
2. Commit and push any changes to the PR head.
3. `$CHANGE_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review 123 --reply-thread-ids PRRT_kwDOSGizTs58XB1L --message "$CHANGE_MESSAGE" --require-sha HEAD`
4. Rerun Shepherd now.
```

More in [docs/features.md](docs/features.md).

## Install

The plugin ships the skills, which drive the CLI, so install both.

```bash
# Claude Code
claude plugin marketplace add jonathanong/harness-plugins
claude plugin install pr-shepherd@harness-plugins

# Codex
codex plugin marketplace add jonathanong/harness-plugins --ref main
codex plugin add pr-shepherd@harness-plugins

# Grok
grok plugin marketplace add jonathanong/pr-shepherd
grok plugin install pr-shepherd --trust

# CLI, for shells and CI
pnpm i -g pr-shepherd
```

Use one package manager for global installs; a second copy shadows the first (`which -a pr-shepherd` lists them).

The plugin does not start the MCP server. For why, and to register it yourself, see [docs/mcp.md](docs/mcp.md#why-the-plugin-does-not-start-it).

Requirements:

- Node.js >= 22.19.0, Bun, or Deno, and `git`
- A GitHub token or authenticated `gh` CLI with [the required access](docs/authentication.md)

## Documentation

[docs/README.md](docs/README.md) indexes every doc. Start with:

- [Features and limits](docs/features.md)
- [CLI commands and flags](docs/cli-usage.md)
- [Actions](docs/actions.md) and [exit codes](docs/exit-codes.md)
- [Configuration](docs/configuration.md) and [comparison with other tools](docs/comparison.md)
- [Upgrading from 0.x](docs/migrating-to-v1.md)

## Harness ecosystem

- [hook-harness](https://github.com/jonathanong/hook-harness): GitHub webhook relay that agents poll for events instead of polling GitHub
- [agent-blackboard](https://github.com/jonathanong/agent-blackboard): session-scoped telemetry for autonomous agents
- [no-mistakes](https://github.com/jonathanong/no-mistakes): deterministic AST-based codebase intelligence, test selection, and linting for agents
