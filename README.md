# pr-shepherd

Take pull requests from scratch to merge-ready with a coding agent as a [Code Mode-style](https://code.claude.com/docs/en/code-mode) plugin. It works with Claude Code, Codex, Grok, and any stdio MCP client.

## Benefits

- **Better decisions:** across 56 PR states, the agent scores 0.97 with the plugin vs. 0.47 with `gh` + the GitHub MCP server ([outcome evals](evals/README.md), 2026-11-15).
- **Lower cost:** modeled cost per PR session is about 36% lower than `gh` and 76% lower than the GitHub MCP server, with 20% / 69% fewer turns ([token bench](evals/tokens/README.md); assumes a warm prompt cache).
- **More PRs on one GitHub quota:** 65% fewer GraphQL points than `gh` per PR session. While CI runs, one 5,000-point hourly budget covers about 80 waiting PRs, vs. about 13 with `gh pr checks --watch` ([GitHub API](docs/github-api.md), [GraphQL usage](docs/graphql-usage.md)). A [GitHub App](docs/github-app.md) and [webhook events](docs/hook-harness.md) cut it further.
- **72 GitHub edge cases handled:** for example, outdated or resolved threads are still shown once, comments edited after the agent read them come back, and conflicts that GraphQL reports as `CLEAN` are caught ([handled cases](docs/handled-cases.md)).
- **Tidy PRs:** bot and outdated comments are triaged and resolved, human reviews get replies, and known bot noise is minimized.
- **Review hygiene:** Shepherd never answers its own replies, skips a denied reply once instead of retrying, hands a repeatedly rejected fix to a human, and never minimizes human comments ([comments and reviews](docs/handled-cases.md#comments-and-reviews)).
- **Less context:** resolved comments and configured bot noise are filtered out before they reach the agent.
- **CI failures, pre-read:** each failing check comes with its failed step, summary, and a log excerpt, so the agent can usually skip fetching logs. Superseded runs, required checks that never started, and approval gates are recognized ([failing checks](docs/actions.md#failing-checks-and-reruns), [CI cases](docs/handled-cases.md#ci-checks)).
- **Cheaper CI:** names the in-progress runs a fix push would cancel anyway, so the agent cancels them early.
- **Why a PR can't merge:** reads branch protection and rulesets and prints the actual requirements, such as `Approvals: None [Required]` ([merge requirements](docs/merge-status.md#merge-requirements)). Merges are pinned to the head the agent checked, review nits wait so a push doesn't eject a queued PR, and a PR a maintainer pulled from the queue is not requeued ([merge and queue](docs/handled-cases.md#merge-and-queue)).
- **Full flow:** from scratch to draft, mergeable, and through the merge queue, including stacked PRs.
- **Review suggestions:** applies suggested changes as commits that credit the reviewer.
- **Safe by construction:** the CLI never mutates git or merges by itself, and human handoff is limited to a [short escalation list](docs/escalations.md).

## Use cases

- **Autonomous agents.** An agent opens a PR and drives it to merge-ready, or merged when you allow it. Nobody has to watch CI and reviews.
- **Exhaustive AI code review.** Some PRs get many bot reviews (CodeRabbit, Codex, Copilot, and others). Shepherd shows every thread and comment once and tracks first-look, edited, and outdated items. It pre-filters comments, batches the replies, resolves, and minimizes.
- **High-velocity teams.** Supports stacked PRs, merge queues, and merge queue ejections, and directs agents to rebase or stack as needed, so work keeps moving even with many conflicts.

## How to use

[Install](#install) the plugin, then ask your agent:

- **"make PRs, /pr-shepherd:pr-shepherd"** makes one PR per change that can be reviewed alone, stacks a PR on an earlier one when it needs that PR's code or edits the same lines, and shepherds every PR until it is mergeable.
- **`/pr-shepherd <PR>`** takes a PR, including a draft, to mergeable. It does not merge. Leave out the PR to use the current branch.
- **`/pr-shepherd <PR1> <PR2>`** shepherds several PRs and returns when any has an actionable step.
- **`/pr-shepherd --merge <PR>`** takes the PR to mergeable and merges it.
- **`/pr-shepherd stack <stack#> --merge`** shepherds a native stack and merges it all at once when it is ready. Use `--merge-through <PR>` instead to merge up to that layer, or `--merge-ready` to merge the bottom layers as they become ready. Listing PR numbers instead of the stack number owns only those layers.

In Codex, use `$pr-shepherd`. In a shell or CI, run `pr-shepherd <PR>`. `/goal` is generally not needed.

Then configure `.pr-shepherdrc.yml` ([configuration](docs/configuration.md)):

- turn on the bundled classification rules to hide known bot comments;
- add your own [classification rules](examples/classification/);
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

Optionally, write your policy ("reply instead of fixing nits", "never merge") into a skill that wraps the shipped one ([skills](docs/skills.md)).

## What it does

Shepherd gathers the full PR context (reviews, CI failures, merge requirements) in one call and returns one action with numbered instructions and exact commands. The agent spends fewer reasoning tokens, tool calls, and turns, and rarely has to investigate on its own.

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

More features are in [docs/features.md](docs/features.md).

## Install

The plugin starts the version-matched `pr-shepherd-mcp` server automatically.

```bash
# Claude Code
claude /plugin marketplace add jonathanong/pr-shepherd
claude /plugin install pr-shepherd

# Codex (then enable the pr-shepherd plugin)
codex plugin marketplace add jonathanong/pr-shepherd

# Grok
grok plugin marketplace add jonathanong/pr-shepherd
grok plugin install pr-shepherd --trust

# CLI, for shells and CI
npm install -g pr-shepherd
```

For the MCP server without the plugin, or a local checkout, see [docs/mcp.md](docs/mcp.md).

Requirements:

- Node.js >= 22.19.0, Bun, or Deno
- `git`
- A GitHub token or an authenticated `gh` CLI with [the required access](docs/authentication.md)

## Documentation

[docs/README.md](docs/README.md) indexes every doc. Start with:

- [Features, workflow assumptions, and limits](docs/features.md)
- [CLI commands, flags, stacks, and polling](docs/cli-usage.md)
- [Actions](docs/actions.md) and [exit codes](docs/exit-codes.md)
- [Configuration and classification rules](docs/configuration.md), with [examples](examples/classification/)
- [Comparison with Cursor, Copilot, CodeRabbit, and others](docs/comparison.md)
- [Upgrading from 0.x](docs/migrating-to-v1.md)

## Harness ecosystem

- [hook-harness](https://github.com/jonathanong/hook-harness): GitHub webhook relay that agents poll for events instead of polling GitHub
- [agent-blackboard](https://github.com/jonathanong/agent-blackboard): session-scoped telemetry for autonomous agents
- [no-mistakes](https://github.com/jonathanong/no-mistakes): deterministic AST-based codebase intelligence, test selection, and linting for agents
