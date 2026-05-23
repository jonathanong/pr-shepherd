# shepherd — architecture

[← README](../README.md)

## Design rationale

- **No MCP surface** — skills call the CLI directly; no long-lived MCP server, no extra auth boundary, smaller reasoning surface.
- **Skills over subagents** — skill prompts inject into the main conversation rather than spawning a subagent that reloads CLAUDE.md every turn, keeping cost and latency low.
- **Safe to interrupt** — durable state lives in the PR on GitHub; the iterate loop self-terminates when the PR is merged, closed, or settles after ready-delay. Local state in `$PR_SHEPHERD_STATE_DIR` can be deleted without data loss.

## Module tree

````
shepherd/
├── index.mts              # bin entrypoint — thin shim that imports cli-parser
├── cli-parser.mts         # argv dispatch; subcommand routing
├── types.mts              # barrel re-exporting types/github.mts, types/iterate.mts, types/report.mts
├── config.json            # default config values
│
├── cli/                   # formatting and argument helpers
│   ├── args.mts           # low-level argv parsing helpers (getFlag, hasFlag, parseCommonArgs, …)
│   ├── exit-codes.mts     # exit-code derivation + parseDurationToMinutes
│   ├── handlers.mts       # async handlers wired from cli-parser (iterate, commit-suggestion)
│   ├── formatters.mts     # barrel for per-output formatters
│   ├── iterate-formatter.mts  # Markdown formatter for IterateResult
│   ├── iterate-lean.mts   # lean JSON projection for default --format=json output
│   └── fix-formatter.mts  # Markdown formatter for fix_code variant
│
├── commands/              # one file (or dir) per subcommand
│   ├── check-annotations.mts  # fetches inline annotations for failing CheckRuns
│   ├── check.mts          # read-only snapshot (GraphQL fetch → classify → report); internal helper
│   ├── check-status.mts   # derives ShepherdStatus from a report
│   ├── clean.mts          # removes local state files
│   ├── commit-suggestion.mts  # emits patch and commit instructions for one suggestion
│   ├── iterate/           # iterate subcommand (default invocation)
│   │   ├── index.mts      # main runIterate orchestrator
│   │   ├── classify.mts   # classifyReviewSummaries
│   │   ├── escalate.mts   # escalation predicate
│   │   ├── fix-code.mts   # fix_code action builder
│   │   ├── helpers.mts    # shared small utilities
│   │   ├── render.mts     # renderResolveCommand
│   │   └── stall.mts      # stall-timeout guard
│   ├── log-file.mts       # prints the per-worktree debug log path
│   ├── mark-files-as-viewed.mts  # marks changed PR files viewed in GitHub
│   ├── poll.mts           # repeats iterate while action is WAIT
│   ├── ready-delay.mts    # ready-delay state machine (ready-since.txt marker)
│   ├── resolve.mts        # fetch + mutate modes (resolve threads, minimize comments, dismiss reviews)
│   └── resolve-instructions.mts  # builds fetch-instructions Markdown
│
├── config/
│   └── load.mts           # RC file loader with deepMerge
│
├── github/
│   ├── client.mts         # getRepoInfo + getCurrentPrNumber
│   ├── http.mts           # fetch-based graphql/rest helpers; token resolution
│   ├── queries.mts        # loads .gql files from disk (never inline raw GraphQL)
│   ├── batch.mts          # single batched GraphQL query (CI + comments + merge state)
│   ├── batch-parsers.mts  # parses raw batch response into typed structures
│   ├── batch-raw-types.mts  # raw GraphQL response types
│   ├── pagination.mts     # generic GraphQL paginator (cursor-based, forward + backward)
│   └── gql/               # *.gql files — one per query/mutation
│       ├── batch-pr.gql   # main batch query
│       ├── check-run-annotations.gql
│       ├── get-pr-head-sha.gql
│       ├── mark-pr-ready.gql
│       ├── pr-number-by-branch.gql
│       └── review-thread-comments.gql
│
├── state/
│   ├── fix-attempts.mts   # per-thread fix-attempt counter (JSON file in state dir)
│   ├── iterate-stall.mts  # stall-state persistence
│   └── seen-comments.mts  # seen-marker gate for first-look threads/comments
│
├── checks/
│   ├── classify.mts       # event filter + CI verdict
│   └── triage.mts         # conclusion → failure kind + failed step name via jobs API
│
├── comments/
│   ├── outdated.mts       # outdated-thread detection (isOutdated flag)
│   └── resolve.mts        # batch mutations (resolve / minimize / dismiss)
│
├── merge-status/
│   └── derive.mts         # CLEAN/BEHIND/CONFLICTS/BLOCKED/UNSTABLE/DRAFT/UNKNOWN derivation
│
├── reporters/
│   └── agent.mts          # agent-facing output helpers
│
├── suggestions/
│   ├── parse.mts          # parse ```suggestion blocks from review thread bodies
│   └── patch.mts          # apply a parsed suggestion as a file patch
│
├── types/
│   ├── github.mts         # GitHub API types (CheckRun, Review, MergeStatusResult, …)
│   ├── iterate.mts        # IterateResult union + IterateCommandOptions
│   └── report.mts         # ShepherdReport + RelevantCheck + related types
│
└── util/
    └── path-segment.mts   # path-segment parsing utility
````

## Dependency direction rule

Dependencies flow in one direction only:

```
commands → github
commands → checks → github
commands → comments → github
commands → state
commands → merge-status
commands → reporters
comments → state
```

- `commands` may import from `github`, `checks`, `comments`, `state`, `merge-status`, and `reporters`.
- `checks` and `comments` may import from `github` for their domain-specific GitHub reads/mutations.
- `github` must not import from `commands`, `checks`, or `comments`.
- `merge-status` and `reporters` are leaf-ish domain modules — they do not import from `commands` or `github`.
- `types/` is shared by all — the files there have no imports from `commands` or `github`. Keep them lean.

Never import upward (e.g., `github` importing from `commands`) — that creates circular dependencies and breaks the single-responsibility model.

## Where to put new code

| What you're adding               | Where it goes                                                   |
| -------------------------------- | --------------------------------------------------------------- |
| New subcommand                   | `commands/<name>.mts`                                           |
| New GraphQL query or mutation    | `github/gql/<name>.gql` + loader in `queries.mts`               |
| New CI check classifier category | `checks/classify.mts` + type in `types/github.mts`              |
| New failure kind                 | `checks/triage.mts` + type in `types/github.mts`                |
| New thread/comment mutation      | `comments/resolve.mts` + `ResolveOptions` in `types/report.mts` |
| New merge state derivation rule  | `merge-status/derive.mts`                                       |
| New tunable constant             | `config.json` + `PrShepherdConfig` in `config/load.mts`         |
| New shared type                  | `types/github.mts`, `types/iterate.mts`, or `types/report.mts`  |

See [extending.md](extending.md) for step-by-step recipes.
