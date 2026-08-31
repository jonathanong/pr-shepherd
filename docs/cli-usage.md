# pr-shepherd interfaces

[← README](../README.md)

pr-shepherd has one workflow model and two transports: the local stdio MCP server for agent clients and a CLI for shells and CI. Both **gather PR context** and **emit the same deterministic action**. The MCP server returns structured data; the CLI renders it as text or JSON.

## Canonical shell commands

```text
pr-shepherd [PR] [poll-flags] [iterate-flags]
pr-shepherd iterate [PR] [iterate-flags]
pr-shepherd apply review [PR] [review-flags]
pr-shepherd apply files [PR] [files...] [--tests] [--match REGEX]
pr-shepherd apply journal [PR] <item> [--dry-run] [--format text|json]
pr-shepherd apply journal [PR] --file <path> [--dry-run] [--format text|json]
pr-shepherd apply journal [PR] --file - [--dry-run] [--format text|json]
pr-shepherd journal extract --body-file <path>
pr-shepherd build-suggestion-patches [PR] --thread-id ID --message MSG [groups...]
pr-shepherd admin clean <pr|branch|current|repo|all> [value] [--dry-run] [--format text|json]
pr-shepherd admin log-file [--format text|json]
```

`PR` may be a number or GitHub pull request URL. When omitted, Shepherd infers the current branch's open PR.

`apply journal --file <path>` reads the journal item from a file; `--file -` reads stdin. Provide either a positional `<item>` or `--file`, not both.

Journal entries live in a collapsed `Shepherd Journal` details block. `apply journal` creates that canonical block when absent, appends before its closing tag, and leaves an exact duplicate unchanged. A legacy `## Shepherd Journal` section is migrated in place on the next journal operation.

`journal extract --body-file <path>` reads a local PR-body file and prints exactly one JSON line from
the typed journal extractor. It makes no GitHub, configuration, or log I/O. On POSIX, the final path
entry is opened without following symlinks and must resolve to a regular file in a trusted parent
directory; symlinks, FIFOs, devices, unreadable paths, and missing files exit 66. Unsupported platforms
fail closed with exit 66. A malformed or unrecognized journal remains a successful typed JSON result.

`pr-shepherd [PR]` is the canonical bounded poll dispatcher. It repeats `iterate` while the action is `WAIT`, then prints the next agent-facing action. With `--merge`, it also continues through `MARK_READY` and emits `MERGE` when the ready-delay completes. If `--timeout` expires during WAIT polling, poll returns that final `WAIT` result rather than a terminal action. `FIX_CODE` is delayed by `--debounce` (default 1m): poll keeps iterating at `--interval` for that window, then returns one later tick. Use `iterate` when the caller owns recurrence.

```sh
pr-shepherd 42 --interval 60s --timeout 4.5m --quiet-status
pr-shepherd 42 --until-terminal --quiet-status
pr-shepherd 42 --debounce 5m
pr-shepherd iterate 42 --ready-delay 15m
pr-shepherd 42 --merge
```

The polling flags are `--interval`, `--timeout`, `--debounce`, `--quiet-status`, and `--until-terminal`. Each ordinary `WAIT` tick writes an explicit still-running line to stderr; the final action remains the only stdout result. `--debounce` (default 1m, `0` disables) is a settle window after the first `FIX_CODE`. Iterate flags are `--ready-delay`, `--stall-timeout`, `--merge`, `--no-auto-mark-ready`, `--format`, and `--verbose`. The legacy `--no-auto-cancel-actionable` flag remains accepted as a no-op. Durations accept `s`, `m`, and `h`; bare polling durations are seconds and bare iterate durations are minutes.

`admin clean` removes local state and `admin log-file` prints the append-only debug log path. They are shell administration commands, not MCP tools.

## MCP server

Install and configure the stdio server in Claude Code, Codex, or Grok with [mcp.md](mcp.md). The plugin and a manual `pr-shepherd-mcp` registration both run:

```text
npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

The server exposes these tools:

| Tool                       | Purpose                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `iterate`                  | Run one state-machine tick. `pr` is required and must be a GitHub PR URL or `owner/repo#N`; its repository is the GitHub target. |
| `apply`                    | Apply ordered review/journal mutations or run selection-only `mark_files_viewed` diagnostics under one required qualified `pr`.  |
| `build_suggestion_patches` | Validate ordered anchored suggestions and return checked patches plus commit metadata.                                           |
| `build_suggestion_patch`   | Deprecated one-item adapter for `build_suggestion_patches`.                                                                      |

Use `iterate` first. Its result surfaces review threads, comments, checks, and the existing structured `resolveCommand`/`resolveOnlyCommand` arguments for review work. Translate those arguments into an `apply` `review_mutations` operation when making the mutation; `mark_files_viewed` selects files and returns an authorization skip without changing viewed state; use `append_journal` for an idempotent PR-body journal entry. Use one `build_suggestion_patches` call for all marked suggestion threads in displayed order.

`build-suggestion-patches` and `build_suggestion_patches` treat GitHub's anchored line range at the fetched PR head as authoritative. They accept a clean local descendant only when the ordered patches pass `git apply --check`; otherwise inspect the current source and reviewer intent manually.

MCP clients own polling recurrence. Do not call a long-running polling tool: call `iterate` again after the returned action-specific work is complete or when the client’s scheduler chooses to recheck.

## CLI aliases

`poll`, `resolve`, `build-suggestion-patch`, `commit-suggestion`, `mark-files-as-viewed`, `journal`, `clean`, and `log-file` are deprecated CLI aliases or adapters. Prefer MCP `iterate`, `apply`, and `build_suggestion_patches` for agent integrations.

All CLI commands honor `--help`/`-h` before I/O. Iterate/poll PR outcomes use exit codes `0` and `10`–`15`; command, validation, and GitHub failures use `sysexits.h` codes. See [exit-codes.md](exit-codes.md).
