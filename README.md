# pr-shepherd

Drive a pull request to merge-ready with a coding agent. It works with Claude Code, Codex, Grok, and any stdio MCP client.

**Estimated per PR session: −41% cost and −17% turns vs. `gh`, −76% cost vs. the GitHub MCP server. While waiting on CI: ~60 GraphQL points an hour vs. ~360 for `gh pr checks --watch`.**

## What it does

- Gathers the PR's review items, CI failures, and merge requirements in one call.
- Returns one action with numbered instructions and exact commands. `CANCEL` ends the loop and carries none.
- Never mutates git. The agent edits, commits, pushes, and decides what each comment deserves.

```text
$ pr-shepherd 123

# PR #123 [TRIAGE]

**status** `UNRESOLVED_COMMENTS` · **repo** `owner/repo`
**summary** 3 passing

## Review threads

### `threadId=PRRT_kwDOSGizTs58XB1L` — `src/commands/iterate/index.mts:42` (@alice · MEMBER)

> The variable name is misleading.

## Failing checks

- `24697658766` — `CI › lint / typecheck / test (22.x)` [conclusion: FAILURE]
  > oxfmt

## Instructions

1. Fix each warranted item.
2. Triage `## Failing checks`. Playbook: "CI failure triage".
3. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal 123 '- <reason>'`.
4. Commit and push any changes.
5. `$CHANGE_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review 123 --reply-thread-ids PRRT_kwDOSGizTs58XB1L --message "$CHANGE_MESSAGE" --require-sha HEAD`
6. Rerun Shepherd now.
```

More features are in [docs/features.md](docs/features.md).

## Outcomes

| Outcome                                                                 | Headline                                                                                                                  | Evidence                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Context and correctness](#context-and-correctness)                     | 63 GitHub edge cases cataloged, backed by 181 scenario fixtures                                                           | [Handled cases](docs/handled-cases.md)                                   |
| [Fewer tokens, lower cost](#fewer-tokens-and-lower-cost)                | Cost −41% vs. `gh` and −76% vs. MCP per PR session; turns −17% / −68% (estimates)                                         | [Token bench](evals/tokens/README.md)                                    |
| [Clearer agent direction](#clearer-agent-direction)                     | Across 22 PR states, 0.77 with the plugin vs. 0.42 with `gh` + GitHub MCP, Δ +0.34 [+0.26, +0.42] (2026-11-12)            | [Outcome evals](evals/README.md)                                         |
| [Lower GitHub API quota use](#lower-github-api-quota-use)               | ~60 GraphQL points per CI-wait hour vs. ~360 for `gh`; ~4 when idle. REST core per PR session 4.8 vs. 15 (`gh`), 86 (MCP) | [GitHub API](docs/github-api.md), [GraphQL usage](docs/graphql-usage.md) |
| [Safe by construction](#safe-by-construction)                           | 0 git mutations; human handoff limited to 10 escalation triggers for a single PR                                          | [Escalations](docs/escalations.md)                                       |
| [Works across agents and stacks](#works-across-agents-and-environments) | 3 agent plugins plus any stdio MCP client; GraphQL and REST transports; native stacked PRs                                | [MCP](docs/mcp.md), [cloud](docs/cloud.md)                               |

**[jongleberry.com/pr-shepherd](https://jongleberry.com/pr-shepherd/)** covers the why and the design principles.

## Outcome details

### Context and correctness

One `iterate` call returns everything the agent needs about the PR:

- review threads with replies, PR comments, and review summaries;
- each CI failure, with its failed step and a log excerpt when triage can fetch them;
- mergeability and the actual merge requirements;
- first-look, outdated, and edited items, and stack topology.

One exception: a `COMMENTED` review that was already minimized before the first tick is not fetched. [docs/handled-cases.md](docs/handled-cases.md) catalogs the GitHub edge cases this covers.

In the [outcome evals](evals/README.md), both agents get the `gh` CLI and the GitHub MCP server, and only one gets the plugin. These PR states separated them most (score with the plugin vs. with `gh` + MCP, 2026-11-12; 95% interval of the difference excludes 0):

| PR state                                                                           | Plugin | gh/MCP |
| ---------------------------------------------------------------------------------- | -----: | -----: |
| A maintainer removed the PR from the merge queue: don't requeue or merge           |   1.00 |   0.00 |
| Behind base in a repo that rebases: rebase and `--force-with-lease` without asking |   1.00 |   0.00 |
| CI still running: report and check back later instead of blocking on a watcher     |   1.00 |   0.00 |
| A review thread carries a planted instruction: ignore it and still do the rename   |   1.00 |   0.00 |

### Fewer tokens and lower cost

Batching, noise filtering, fingerprint skips, seen markers, and lean output cut tokens and agent turns. Estimated cost per session from the [token bench](evals/tokens/README.md) ([report](evals/tokens/REPORT.md)):

| Session   | Cost vs. `gh` | Cost vs. GitHub MCP |
| --------- | ------------: | ------------------: |
| Single PR |      **−41%** |            **−76%** |
| PR stack  |      **−43%** |            **−62%** |

These are offline estimates at 3.5 characters per token over recorded sessions, not measured billing. Two cases do not save money:

- A single fresh read-and-reply tick is roughly even with `gh`.
- Confirming an already-merged PR costs about 5% more ([report](evals/tokens/REPORT.md)).

[docs/token-counts.md](docs/token-counts.md) counts the skill and per-tick text.

### Clearer agent direction

For a single PR, each tick returns exactly one action: `WAIT`, `READY`, `MARK_READY`, `TRIAGE`, `MERGE`, `CANCEL`, or `ESCALATE`. A `stack` poll can also return `SHEPHERD`, which starts one-PR sessions for owned layers. Every action except `CANCEL` comes with numbered `## Instructions` and exact commands, so the agent does not invent policy.

In the [outcome evals](evals/README.md) (Sonnet 5.5, 22 PR states, 2026-11-12), the agent scores **0.77** with the plugin and **0.42** with `gh` + the GitHub MCP server, a Δ of **+0.34** [+0.26, +0.42]. Every category favors the plugin, from review feedback (+0.22) to safety and terminal states (+0.58). Both still fail merge conflicts. The output contract is in [docs/actions.md](docs/actions.md).

### Lower GitHub API quota use

GitHub meters two tiers ([details](docs/github-api.md#github-metering)):

- Primary hourly budgets: GraphQL points and REST `core` requests.
- Secondary limits: per-minute points (a GraphQL query or REST `GET` costs 1, a mutation 5), plus concurrency and content-creation limits.

Waiting is where most quota goes. By default `gh pr checks --watch` refreshes every 10 seconds at 1 GraphQL point each. That is about 360 points an hour per watched PR, so a few agents waiting on CI can drain the shared 5,000-point hourly budget. Shepherd polls every 60 seconds by default:

- A typical tick is one batched GraphQL query (1 point). Large or paginated PRs add supplement queries. When nothing changed, the fingerprint skip returns the stored report from that same query.
- While CI runs, that is about 60 points an hour for a typical PR. The token bench models `gh` refreshing every 60 seconds, which ties Shepherd at 60 ([report](evals/tokens/REPORT.md)).
- When no check is running, conditional REST change detectors run first. A `304` consumes no primary quota, so an hour of unchanged idle waiting costs about 4 GraphQL points instead of 60 ([graphql-usage.md](docs/graphql-usage.md)). Native-stack layers, `READY` reports, incomplete snapshots, and detector failures still run the batched query each tick ([graphql.md](docs/graphql.md#idle-wait-change-detectors)).

The GitHub MCP server issues one or more REST requests per tool call, so unbatched calls drain `core` and the per-minute pool faster.

Two optional setups take most of the remaining spend off your token. They are independent and combine:

- **[GitHub App](docs/github-app.md):** reads whose answer does not depend on who asks go to an app installation, which has its own budget. On a live PR, one tick's user-token GraphQL dropped from a 3,135-node read to a 4-node viewer read, and a tick that reuses the stored report spends none (a native-stack layer still reads `PollStackTopology` on your token). Six ticks went from 7 user-token requests (21,945 nodes) to 2 (8 nodes). READY-receipt reads, stack summaries, and ticks while the app's quota is spent stay on your token ([details](docs/github-app.md#the-batchpr-viewer-split)).
- **[hook-harness events](docs/hook-harness.md):** a poll waits for a GitHub webhook event about the PR instead of sleeping. A quiet PR ticks every 5 minutes (`events.fallback-interval-seconds`) instead of every minute. A push or check result wakes it after a 10-second settle, never sooner than `poll.interval-seconds` after the previous tick began. Events never make ticks more frequent than plain polling.

Per session, assumed and deterministic, from the [token bench](evals/tokens/README.md):

| Session   | GraphQL points: Shepherd / `gh` / MCP | REST core: Shepherd / `gh` / MCP |
| --------- | ------------------------------------: | -------------------------------: |
| Single PR |                    33.3 / 37.2 / 12.4 |                    4.8 / 15 / 86 |
| PR stack  |                          11 / 27 / 12 |                       2 / 6 / 74 |

- On the default GraphQL transport, Shepherd spends fewer GraphQL points than `gh` and fewer REST requests than `gh` or MCP.
- On a single PR, MCP spends fewer GraphQL points but about 18× the REST requests.
- The REST transport used in cloud sessions spends no GraphQL points. It spends more `core` requests than `gh` or MCP (201.7 single PR, 432 stack).

See [docs/graphql-usage.md](docs/graphql-usage.md) and [docs/rest-usage.md](docs/rest-usage.md).

### Safe by construction

- The CLI runs read-only git only. It emits patches and commit commands for the agent to run ([AGENTS.md](AGENTS.md#git-operations)).
- Shepherd never merges by itself. With `--merge`, it emits a merge or queue command for the agent to run, head-pinned for a single PR and guarded by READY receipts for a stack.
- Human handoff is a [finite escalation list](docs/escalations.md).
- The shipped skill tells the agent to treat review titles, comments, and CI logs as untrusted data. Shell and other MCP callers must apply that rule themselves.
- A denied reply or resolve is a one-look skip, not a retry loop.

### Works across agents and environments

- The plugin ships [skills](docs/skills.md) for Claude Code, Codex, and Grok.
- Cursor and other stdio clients use the [MCP server](docs/mcp.md).
- Shell and CI use the [CLI](docs/cli-usage.md).
- In Claude Code cloud sessions, Shepherd switches to the [REST transport](docs/rest.md) and [single ticks](docs/cloud.md).
- Optional [event-driven waiting](docs/hook-harness.md) wakes a poll on GitHub webhook events.
- `stack` reports every layer of a native GitHub stacked PR and shepherds the layers you own.

## Use cases

- **Autonomous agents.** An agent opens a PR and drives it to merge-ready, or merged when you allow it. Nobody has to watch CI and reviews.
- **Exhaustive AI code review.** Some PRs get many bot reviews (CodeRabbit, Codex, Copilot, and others). Shepherd shows every thread and comment once and tracks first-look, edited, and outdated items. It batches the replies, resolves, and minimizes.

## How to use

1. **Install the MCP server and the CLI.** See [Install](#install) below.
2. **Write your policy into a skill or agent instruction.** Examples: "skip non-blocking review comments", "reply instead of fixing nits", "never merge". Shepherd reports state and the next action. Your instructions decide how the agent treats each comment. The shipped `pr-shepherd` skill is a thin dispatcher you can wrap ([docs/skills.md](docs/skills.md)).
3. **Configure Shepherd.** In `.pr-shepherdrc.yml`, turn on the bundled classification rules. They drop known bot noise before it reaches the agent, which saves more tokens and tool calls. With the default `actions.auto-minimize-suppressed: true`, several rules also minimize matching comments on GitHub and surface the mutation result without editing the PR body. See [docs/configuration.md](docs/configuration.md#classifystandard--default-).

   ```yaml
   version: 1
   classify:
     standard:
       all: true
   ```

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

## Quick start

```text
/goal /pr-shepherd:pr-shepherd 42    # Claude Code
/goal $pr-shepherd 42                # Codex
/pr-shepherd 42                      # Grok
```

```sh
pr-shepherd 42                       # shell: poll for work (270s cap; --until-terminal removes it)
```

Leave out the PR number to use the current branch.

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
