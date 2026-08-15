# pr-shepherd interfaces

[← README](../README.md)

pr-shepherd has one workflow model and two transports: the local stdio MCP server for agent clients and a CLI for shells and CI. The MCP server returns structured data; the CLI renders the same state as text or JSON.

## Canonical shell commands

```text
pr-shepherd [PR] [poll-flags] [iterate-flags]
pr-shepherd iterate [PR] [iterate-flags]
pr-shepherd apply review [PR] [review-flags]
pr-shepherd apply files [PR] [files...] [--tests] [--match REGEX]
pr-shepherd apply journal [PR] <item> [--dry-run] [--format text|json]
pr-shepherd build-suggestion-patch [PR] --thread-id ID --message MSG [flags]
pr-shepherd admin clean <pr|branch|current|repo|all> [value] [--dry-run] [--format text|json]
pr-shepherd admin log-file [--format text|json]
```

`PR` may be a number or GitHub pull request URL. When omitted, Shepherd infers the current branch's open PR.

`pr-shepherd [PR]` is the canonical bounded poll dispatcher. It repeats `iterate` while the action is `WAIT`, then prints the first `MARK_READY`, `FIX_CODE`, `CANCEL`, or `ESCALATE` result. Use `iterate` when the caller owns recurrence.

```sh
pr-shepherd 42 --interval 60s --timeout 4.5m --quiet-status
pr-shepherd 42 --until-terminal --quiet-status
pr-shepherd iterate 42 --ready-delay 15m
```

The polling flags are `--interval`, `--timeout`, `--quiet-status`, and `--until-terminal`. Iterate flags are `--ready-delay`, `--stall-timeout`, `--no-auto-mark-ready`, `--no-auto-cancel-actionable`, `--format`, and `--verbose`. Durations accept `s`, `m`, and `h`; bare polling durations are seconds and bare iterate durations are minutes.

`admin clean` removes local state and `admin log-file` prints the append-only debug log path. They are shell administration commands, not MCP tools.

## MCP server

The plugin runs a version-matched local server with:

```text
npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

The server exposes these tools:

| Tool                     | Purpose                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `iterate`                | Run one state-machine tick. Optional inputs include `pr` (a number or PR URL), timing overrides, and auto-action overrides.                 |
| `apply`                  | Apply an ordered set of review mutations, `mark_files_viewed`, or `append_journal` operations under one optional `pr` (a number or PR URL). |
| `build_suggestion_patch` | Validate one anchored review suggestion and return an applyable patch plus commit metadata.                                                 |

Use `iterate` first. Its result surfaces review threads, comments, checks, and the existing structured `resolveCommand`/`resolveOnlyCommand` arguments for review work. Translate those arguments into an `apply` `review_mutations` operation when making the mutation; use `mark_files_viewed` to mark selected changed files viewed; use `append_journal` for an idempotent PR-body journal entry. Use `build_suggestion_patch` only for a suggestion thread that needs its validated unified diff.

MCP clients own polling recurrence. Do not call a long-running polling tool: call `iterate` again after the returned action-specific work is complete or when the client’s scheduler chooses to recheck.

## Compatibility aliases

`poll`, `resolve`, `commit-suggestion`, and `mark-files-as-viewed` remain supported CLI aliases for existing automation. They are no longer the advertised integration surface; new agent integrations should use MCP `iterate`, `apply`, and `build_suggestion_patch`.

All CLI commands honor `--help`/`-h` before I/O. Iterate/poll PR outcomes use exit codes `0` and `10`–`14`; command, validation, and GitHub failures use `sysexits.h` codes. See [exit-codes.md](exit-codes.md).
