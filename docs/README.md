# pr-shepherd — reference documentation

Shepherd does two jobs: **gather all context for a PR**, then **emit one deterministic action** for the calling agent. The README states that framing; this index is the map.

Quick start: [`../README.md`](../README.md). Narrative site (why, principles):
[jongleberry.com/pr-shepherd](https://jongleberry.com/pr-shepherd/) — that site links back
into these files for every claim it makes; this remains the canonical spec.

## Why and overview

| Document                       | What it covers                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [features.md](features.md)     | Context gathered, actions emitted, and what is not supported                                                |
| [comparison.md](comparison.md) | Named alternatives (including Cursor `/autopilot` and Copilot `/pr auto`), tradeoffs, and best-fit guidance |

## Job 1 — Context gathered

| Document                           | What it covers                                               |
| ---------------------------------- | ------------------------------------------------------------ |
| [context.md](context.md)           | Inventory of what one `iterate`/poll surfaces                |
| [comments.md](comments.md)         | Threads, comments, summaries, seen markers, mutations        |
| [checks.md](checks.md)             | Classify → triage → `failedStep`, `jobName`, event filtering |
| [merge-status.md](merge-status.md) | `deriveMergeStatus` plus printed merge requirements          |
| [graphql.md](graphql.md)           | Batch query, pagination, REST supplements                    |

## Job 2 — Actions emitted

| Document                           | What it covers                                                  |
| ---------------------------------- | --------------------------------------------------------------- |
| [actions.md](actions.md)           | Every action: trigger, side-effects, prescriptive output fields |
| [escalations.md](escalations.md)   | The finite escalation list, exact predicates, and non-cases     |
| [iterate-flow.md](iterate-flow.md) | Dispatch order, mermaid, ready-delay, stall                     |
| [exit-codes.md](exit-codes.md)     | Process exit codes: PR-state `0`/`10`–`14`, `sysexits.h` errors |

## How you run it

| Document                               | What it covers                                                           |
| -------------------------------------- | ------------------------------------------------------------------------ |
| [mcp.md](mcp.md)                       | Install and use the local stdio MCP server                               |
| [cli-usage.md](cli-usage.md)           | Canonical shell commands and MCP tool reference                          |
| [skills.md](skills.md)                 | Claude Code, Codex, and Grok skill usage and recurrence                  |
| [api.md](api.md)                       | Package exports: `pr-shepherd`, `pr-shepherd/mcp`, `classify`, `journal` |
| [configuration.md](configuration.md)   | `.pr-shepherdrc.yml` and environment variables                           |
| [authentication.md](authentication.md) | PAT resolution, required fine-grained access, classic scopes             |

## Internals

| Document                           | What it covers                                      |
| ---------------------------------- | --------------------------------------------------- |
| [architecture.md](architecture.md) | Module map, dependency rules, where to put new code |
| [extending.md](extending.md)       | Recipes: add an action, classifier, mutation        |
| [debugging.md](debugging.md)       | Failure modes, how to replay an iteration           |
