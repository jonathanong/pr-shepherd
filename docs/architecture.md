# shepherd — architecture

[← README](../README.md)

## Module tree

```
shepherd/
├── index.mts              # bin entrypoint — argv dispatch, exit codes
├── cli.mts                # argv parsing + subcommand dispatch
├── types.mts              # all shared types (BatchPrData, MergeStatusResult, IterateResult, …)
├── config.json            # tunable constants (TTL, patterns, concurrency, ready-delay)
│
├── commands/              # one file per subcommand
│   ├── check.mts          # read-only snapshot (GraphQL fetch → classify → report)
│   ├── resolve.mts        # fetch + mutate modes (resolve threads, minimize comments, dismiss reviews)
│   ├── ready-delay.mts    # ready-delay state machine (ready-since.txt marker)
│   └── iterate.mts        # cooldown + sweep + escalation + deterministic dispatch → compact JSON action
│
├── github/
│   ├── client.mts         # thin gh-cli wrapper (execFile + JSON parsing)
│   ├── queries.mts        # loads .gql files from disk (never inline raw GraphQL)
│   ├── batch.mts          # single batched GraphQL query (CI + comments + merge state)
│   ├── pagination.mts     # generic GraphQL paginator (cursor-based, forward + backward)
│   └── gql/               # *.gql files — one per query/mutation
│       ├── batch-pr.gql   # main batch query
│       ├── resolve-thread.gql
│       ├── minimize-comment.gql
│       └── dismiss-review.gql
│
├── cache/
│   └── file-cache.mts     # TTL-aware file cache with atomic writes (tmp + rename)
│
├── checks/
│   ├── classify.mts       # event filter + CI verdict (CheckCategory, CiVerdict)
│   └── triage.mts         # failure kind (timeout / cancelled / actionable) + failed step name
│
├── comments/
│   ├── outdated.mts       # outdated-thread detection (isOutdated flag)
│   └── resolve.mts        # batch mutations (resolve / minimize / dismiss)
│
├── merge-status/
│   └── derive.mts         # CLEAN/BEHIND/CONFLICTS/BLOCKED/UNSTABLE/DRAFT/UNKNOWN derivation
│
└── reporters/
    ├── text.mts           # human-readable output (check, status commands)
    └── json.mts           # machine-readable output for slash commands (iterate)
```

## Dependency direction rule

Dependencies flow in one direction only:

```
commands → github → cache
commands → checks
commands → comments
commands → merge-status
commands → reporters
```

- `commands` may import from `github`, `cache`, `checks`, `comments`, `merge-status`, and `reporters`.
- `github` may import from `cache` but not from `commands`.
- `checks`, `comments`, `merge-status`, and `reporters` are leaf nodes — they do not import from `commands` or `github`.
- `types.mts` is shared by all — it has no imports of its own. Keep it lean.

Never import upward (e.g., `github` importing from `commands`) — that creates circular dependencies and breaks the single-responsibility model.

## Where to put new code

| What you're adding               | Where it goes                                            |
| -------------------------------- | -------------------------------------------------------- |
| New subcommand                   | `commands/<name>.mts`                                    |
| New GraphQL query or mutation    | `github/gql/<name>.gql` + loader in `queries.mts`        |
| New CI check classifier category | `checks/classify.mts` + type in `types.mts`              |
| New failure kind                 | `checks/triage.mts` + type in `types.mts`                |
| New thread/comment mutation      | `comments/resolve.mts` + `ResolveOptions` in `types.mts` |
| New merge state derivation rule  | `merge-status/derive.mts`                                |
| New tunable constant             | `config.json`                                            |
| New shared type                  | `types.mts`                                              |

See [extending.md](extending.md) for step-by-step recipes.
