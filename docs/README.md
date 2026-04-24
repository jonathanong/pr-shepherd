# pr-shepherd — reference documentation

Quick entry point. For a command overview see [`../README.md`](../README.md).

| Document                             | What it covers                                                  |
| ------------------------------------ | --------------------------------------------------------------- |
| [usage.md](usage.md)                 | CLI command reference and flags                                 |
| [skills.md](skills.md)               | Claude Code skill usage (`/pr-shepherd:*`)                      |
| [configuration.md](configuration.md) | `.pr-shepherdrc.yml` reference                                  |
| [custom-commands.md](custom-commands.md) | Project-local slash command that wraps the CLI without the plugin |
| [forking.md](forking.md)             | How to fork and customize pr-shepherd                           |
| [flow.md](flow.md)                   | End-to-end mermaid flow diagram                                 |
| [architecture.md](architecture.md)   | Module map, dependency rules, where to put new code             |
| [iterate-flow.md](iterate-flow.md)   | Full 8-step dispatch walkthrough inside `iterate`               |
| [actions.md](actions.md)             | Every action: trigger, side-effects, prescriptive output fields |
| [watch-loop.md](watch-loop.md)       | How the monitor skill + `/loop` + `iterate` interact            |
| [ready-delay.md](ready-delay.md)     | The `ready-since.txt` state machine                             |
| [cache.md](cache.md)                 | File layout, atomic writes, TTL, bypass paths                   |
| [graphql.md](graphql.md)             | Batch query, pagination strategy, REST fallbacks                |
| [checks.md](checks.md)               | Classify → triage → `failureKind`, event filtering              |
| [comments.md](comments.md)           | Threads vs comments, outdated detection, push-before-resolve    |
| [merge-status.md](merge-status.md)   | `deriveMergeStatus` rules, edge cases                           |
| [extending.md](extending.md)         | Recipes: add an action, classifier, mutation                    |
| [debugging.md](debugging.md)         | Failure modes, how to replay an iteration                       |
