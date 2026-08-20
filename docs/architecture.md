# shepherd — architecture

[← README](../README.md)

## Design rationale

Modules split along the two jobs: **context gather** (github, checks, comments, merge-status) and **action emit** (iterate, poll, formatters, MCP tools). I/O (CLI parser, MCP stdio, `api.mts`) is a thin adapter over those.

- **One local MCP surface** — the version-matched stdio server is the canonical agent integration. It shares command implementations and GitHub token resolution with the CLI; plugins only declare the same local server. See [mcp.md](mcp.md).
- **Skills over subagents** — skill prompts inject into the main conversation rather than spawning a subagent that reloads CLAUDE.md every turn, keeping cost and latency low.
- **Safe to interrupt** — durable state lives in the PR on GitHub; the iterate loop self-terminates when the PR is merged, closed, or settles after ready-delay. Local state in `$PR_SHEPHERD_STATE_DIR` can be deleted without data loss.

## Module tree

```
src/
├── index.mts              # bin entrypoint — thin shim that imports cli-parser
├── api.mts                # createPrShepherd programmatic API
├── mcp-stdio.mts          # pr-shepherd-mcp binary entry
├── cli-parser.mts         # argv dispatch
├── types.mts              # barrel for types/*
├── exit-codes.mts         # EXIT map — see docs/exit-codes.md
├── config.json            # default config values
├── config/                # cascading RC loader
│
├── cli/                   # formatting and argument helpers
├── mcp/                   # iterate, apply, build_suggestion_patch tools
│   ├── server.mts
│   └── index.mts          # createPrShepherdMcpServer / runPrShepherdMcpStdio
│
├── commands/              # one file (or dir) per subcommand
│   ├── check.mts          # context sweep (GraphQL fetch → classify → report)
│   ├── check-status.mts   # ShepherdStatus from a report
│   ├── iterate/           # action dispatch (runIterate)
│   ├── poll.mts           # bounded WAIT loop + FIX_CODE debounce
│   ├── ready-delay.mts    # ready-since.txt
│   ├── resolve-mutate.mts # apply review mutations
│   ├── journal/           # PR-body journal
│   ├── commit-suggestion.mts  # build-suggestion-patch
│   ├── mark-files-as-viewed.mts
│   └── clean.mts
│
├── github/                # GraphQL batch + REST supplements
│   ├── graphql-http.mts   # graphqlWithRateLimit
│   ├── batch.mts          # first-page batch + slim extra-page follow-ups
│   ├── batch-page.mts     # combined @include pagination
│   └── gql/
│       ├── batch-pr.gql
│       ├── batch-pr-page.gql
│       └── commit-suggestion-thread.gql
├── checks/                # classify, triage, startup-failures, superseded
├── comments/              # resolve / minimize / dismiss mutations
├── merge-status/          # deriveMergeStatus + deriveMergeRequirements
├── classify/              # .pr-shepherd/classification/ loader + types
├── log/                   # per-worktree debug log
├── state/                 # seen markers, stall, fix-attempts
├── threads/               # thread transcripts
├── suggestions/           # suggestion fence parse + unified diff
└── types/
```

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
- `exit-codes.mts` (top-level) is a shared leaf like `types/` — it imports only from `types.mts`, and `github`, `config`, `commands`, and `cli` all import from it. It does not live under `cli/` because non-CLI modules (`github/errors.mts`, `config/load.mts`) need it too.

Never import upward (e.g., `github` importing from `commands`) — that creates circular dependencies and breaks the single-responsibility model.

## Where to put new code

| What you're adding               | Where it goes                                                    |
| -------------------------------- | ---------------------------------------------------------------- |
| New MCP tool                     | `mcp/server.mts` adapter over an existing command                |
| New subcommand                   | `commands/<name>.mts`                                            |
| New GraphQL query or mutation    | `github/gql/<name>.gql` + loader in `queries.mts`                |
| New CI check classifier category | `checks/classify.mts` + type in `types/check-classification.mts` |
| New failure kind                 | `checks/triage.mts` + type in `types/github.mts`                 |
| New thread/comment mutation      | `comments/resolve.mts` + `ResolveOptions` in `types/report.mts`  |
| New merge state derivation rule  | `merge-status/derive.mts`                                        |
| New merge-requirement field      | `merge-status/requirements.mts` + `requirements-format.mts`      |
| New MCP/API operation            | `api.mts` + `mcp/server.mts`                                     |
| New tunable constant             | `config.json` + `PrShepherdConfig` in `config/load.mts`          |
| New shared type                  | `types/github.mts`, `types/iterate.mts`, or `types/report.mts`   |
| New exit code                    | `EXIT` map in `exit-codes.mts` + [exit-codes.md](exit-codes.md)  |

See [extending.md](extending.md) for step-by-step recipes.
