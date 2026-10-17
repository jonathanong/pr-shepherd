# pr-shepherd reference documentation

Shepherd gathers a PR's full state from GitHub and returns one deterministic action for the calling agent. This index groups the docs by the outcome they support. These files are the canonical spec.

The [README](../README.md) and the site, [jongleberry.com/pr-shepherd](https://jongleberry.com/pr-shepherd/), are written for people evaluating or installing Shepherd. These docs are written for agents and contributors: exact contracts, predicates, and numbers. Both link back here for every claim they make.

## Overview

| Document                       | What it covers                                                         |
| ------------------------------ | ---------------------------------------------------------------------- |
| [features.md](features.md)     | Features, workflow assumptions, and what is not supported              |
| [comparison.md](comparison.md) | Alternatives (Cursor `/autopilot`, Copilot `/pr auto`, review bots, …) |

## Context and correctness

| Document                                                 | What it covers                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| [handled-cases.md](handled-cases.md)                     | Catalog of GitHub edge cases Shepherd handles, with fixtures    |
| [context.md](context.md)                                 | Inventory of what one `iterate` or poll surfaces                |
| [comments.md](comments.md)                               | Threads, comments, summaries, seen markers, mutations           |
| [conversation-resolution.md](conversation-resolution.md) | Human inline threads versus required conversation resolution    |
| [checks.md](checks.md)                                   | Classify, then triage: `failedStep`, `jobName`, event filtering |
| [merge-status.md](merge-status.md)                       | `deriveMergeStatus` and printed merge requirements              |

## Fewer tokens and lower cost

| Document                                               | What it covers                                                |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| [token-counts.md](token-counts.md)                     | Skill and per-tick token counts                               |
| [../evals/tokens/README.md](../evals/tokens/README.md) | Session cost benchmark against `gh` and the GitHub MCP server |

## Clearer agent direction

| Document                                 | What it covers                                                   |
| ---------------------------------------- | ---------------------------------------------------------------- |
| [actions.md](actions.md)                 | Every action: trigger, side effects, output fields, instructions |
| [iterate-flow.md](iterate-flow.md)       | Dispatch order, ready-delay, stall guard                         |
| [exit-codes.md](exit-codes.md)           | Exit codes: PR state `0` and `10`–`16`, `sysexits.h` errors      |
| [../evals/README.md](../evals/README.md) | Behavior evals with and without the plugin                       |

## Lower GitHub API quota use

| Document                             | What it covers                                                          |
| ------------------------------------ | ----------------------------------------------------------------------- |
| [github-api.md](github-api.md)       | Transport selection, metering, quota warnings, backoff                  |
| [graphql.md](graphql.md)             | Batch query, operation catalog, fingerprint skip, REST in GraphQL mode  |
| [graphql-usage.md](graphql-usage.md) | GraphQL points per command, and which spend is worth reducing           |
| [rest.md](rest.md)                   | REST snapshot coverage, conditional reads, unknown fields, `ccr` routes |
| [rest-usage.md](rest-usage.md)       | REST `core` requests per command and tick                               |

## Safe by construction

| Document                               | What it covers                                              |
| -------------------------------------- | ----------------------------------------------------------- |
| [escalations.md](escalations.md)       | The finite escalation list, exact predicates, and non-cases |
| [authentication.md](authentication.md) | Token resolution, fine-grained access, classic scopes       |

## Works across agents and environments

| Document                             | What it covers                                                           |
| ------------------------------------ | ------------------------------------------------------------------------ |
| [mcp.md](mcp.md)                     | Install and use the local stdio MCP server                               |
| [skills.md](skills.md)               | Claude Code, Codex, and Grok skills and recurrence                       |
| [cli-usage.md](cli-usage.md)         | Shell commands, stacks, polling, and the MCP tool reference              |
| [cloud.md](cloud.md)                 | Single ticks, Claude Code cloud, `nextCheck`, durable state              |
| [configuration.md](configuration.md) | `.pr-shepherdrc.yml` and environment variables                           |
| [api.md](api.md)                     | Package exports: `pr-shepherd`, `pr-shepherd/mcp`, `classify`, `journal` |

## Internals

| Document                           | What it covers                                      |
| ---------------------------------- | --------------------------------------------------- |
| [architecture.md](architecture.md) | Module map, dependency rules, where to put new code |
| [extending.md](extending.md)       | Recipes: add an action, classifier, mutation        |
| [debugging.md](debugging.md)       | Failure modes, how to replay an iteration           |
