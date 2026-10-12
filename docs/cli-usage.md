# pr-shepherd interfaces

[← README](../README.md)

Reference for the `pr-shepherd` shell commands and flags, for people and agents driving Shepherd from a terminal or CI. The CLI and the local stdio MCP server share one workflow model: both **gather PR context** and **emit the same deterministic action**. The MCP server returns structured data ([mcp.md](mcp.md)); the CLI renders it as text or JSON.

## Canonical shell commands

```text
pr-shepherd --version | -v
pr-shepherd --help | -h
pr-shepherd [PR ...] [poll-flags] [iterate-flags]
pr-shepherd --stack PR [poll-flags] [iterate-flags]
pr-shepherd iterate [PR] [iterate-flags]
pr-shepherd apply merge [PR] --require-sha SHA --merge-action ACTION [--method M] [--expected-stack JSON] --transport rest
pr-shepherd apply review [PR] [review-flags]
pr-shepherd apply files [PR] [files...] [--tests] [--match REGEX]
pr-shepherd apply journal [PR] <item> [--dry-run] [--format text|json]
pr-shepherd apply journal [PR] --file <path> [--dry-run] [--format text|json]
pr-shepherd apply journal [PR] --file - [--dry-run] [--format text|json]
pr-shepherd apply check-blocker [PR] --check <name> --blocked-by <ref>
pr-shepherd apply check-blocker [PR] --check <name> --clear
pr-shepherd apply queue-removal [PR] --require-sha SHA --queue-commit SHA --removed-at UNIX
pr-shepherd journal extract --body-file <path>
pr-shepherd playbook [name] [--format text|json]
pr-shepherd build-suggestion-patches [PR] --thread-id ID --message MSG [groups...]
pr-shepherd admin clean <pr|branch|current|repo|all> [value] [--dry-run] [--format text|json] [--poll-mode auto|poll|event]
pr-shepherd admin log-file [--format text|json] [--poll-mode auto|poll|event]
```

`PR` may be a number, `owner/repo#N`, or a GitHub pull request URL. Multiple explicit PRs must resolve to one repository. `--stack PR` selects the complete native GitHub stack containing that PR, ordered bottom-to-top. When omitted, Shepherd infers the current branch's open PR. A qualified PR selects the GitHub target; the working directory stays the local git, config, rules, and log context.

| Command                    | What it does                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr-shepherd [PR ...]`     | Bounded poll dispatcher (one PR, an explicit set, or `--stack`). See [Polling](#polling).                                                          |
| `iterate`                  | One state-machine tick. Use it when the caller owns recurrence.                                                                                    |
| `apply merge`              | Submit or resume one SHA-guarded asynchronous REST merge or enqueue request. Requires `--transport rest`.                                          |
| `apply review`             | Reply to, resolve, minimize, and dismiss review items after fixes.                                                                                 |
| `apply files`              | Mark selected changed files as viewed (`markFileAsViewed`).                                                                                        |
| `apply journal`            | Append an item to the PR body's Shepherd Journal.                                                                                                  |
| `apply check-blocker`      | Record (or `--clear`) that a failing check is blocked on an external PR or issue.                                                                  |
| `apply queue-removal`      | Acknowledge one current CI-driven native-stack queue removal.                                                                                      |
| `journal extract`          | Parse a local PR-body file into typed journal JSON.                                                                                                |
| `playbook [name]`          | Print a bundled skill playbook so agents without the skill can read it. No name lists them; an unknown name exits 64 and lists the available ones. |
| `build-suggestion-patches` | Build ordered, `git apply --check`-validated patches from review suggestions. Never edits files or git history.                                    |
| `admin clean`              | Remove local Shepherd state (`pr`, `branch`, `current`, `repo`, or `all`).                                                                         |
| `admin log-file`           | Print the append-only per-worktree debug log path.                                                                                                 |

### Apply subcommand details

- **`apply merge`** — rerun the same command to resume its persisted UUID; `pending` and `enqueued` are not merged, and an uncertain submission is never repeated automatically. `--method` applies only to `direct_merge`. See [actions.md](actions.md#merge).
- **`apply review`** — flags `--resolve-thread-ids`, `--reply-thread-ids`, `--minimize-comment-ids`, `--dismiss-review-ids`, `--message` (required with reply or dismiss IDs), `--require-sha <sha|HEAD>`, and `--adopt-existing-replies` (generated durable-state commands only). At least one ID flag is required. Explicit IDs are forwarded without iterate's author or capability filtering.
- **`apply journal`** — provide either a positional `<item>` or `--file` (`--file -` reads stdin), not both. Entries live in a collapsed `Shepherd Journal` details block: `apply journal` creates that canonical block when absent, appends before its closing tag, and leaves an exact duplicate unchanged. A legacy `## Shepherd Journal` section is migrated in place on the next journal operation.
- **`apply check-blocker --check <name>`** — records that an exact failing check name is blocked on `--blocked-by`: a pull URL, an issue URL, `owner/repo#N` (pull), or `issue:owner/repo#N`. `--clear` removes that check only.
- **`apply queue-removal`** — records a local acknowledgment of a current CI-driven native-stack removal, pinned to the head SHA, queue commit SHA, and removal timestamp. Run the generated command only after inspecting the failed queue evidence and deciding the failure was transient or came from another entry in the same queue group, with no source change or other blocker remaining. Only GitHub's `failed_checks` removal reason qualifies; manual, stale, and non-stack removals are rejected, and REST reports it as transport-unsupported. Fresh source checks and a one-PR READY receipt then permit aggregate stack recovery; the command itself does not enqueue or merge.
- **`journal extract --body-file <path>`** — prints exactly one JSON line from the typed journal extractor, with no GitHub, configuration, or log I/O. On POSIX the final path entry is opened without following symlinks and must be a regular file in a trusted parent directory; symlinks, FIFOs, devices, unreadable paths, and missing files exit 66, and unsupported platforms fail closed with exit 66. A malformed or unrecognized journal is still a successful typed JSON result.
- **`build-suggestion-patches`** — each `--thread-id` starts a group with its `--message` and optional `--description`. GitHub's anchored line range at the fetched PR head is authoritative; a clean local descendant is accepted only when the ordered patches pass `git apply --check`. Otherwise inspect the current source and reviewer intent manually.

## Polling

`pr-shepherd [PR]` is the canonical bounded poll dispatcher. It repeats `iterate` while the action is `WAIT`, then prints the next agent-facing action:

- A clean PR inside its ready-delay returns `READY` with `remainingSeconds` immediately rather than sleeping through the countdown.
- `FIX_CODE` and aggregate stack-level `SHEPHERD` are delayed by `--debounce` (default `poll.debounceSeconds`, built-in 1m): poll keeps iterating at `--interval` for that window, then returns one later tick.
- If `--timeout` expires during WAIT polling, poll returns that final `WAIT` result rather than a terminal action.
- With `--merge` it also continues through `MARK_READY`; the rerun after the ready-delay completes emits `MERGE`. A native-stack member instead returns non-terminal `FIX_CODE` with a complete `--stack <PR URL> --until-terminal --merge` route; the aggregate selector verifies the bottom layer before emitting its merge command.
- `--until-terminal` ignores `--timeout` for WAIT ticks and continues through `WAIT`/`MARK_READY` until READY, FIX_CODE, MERGE, CANCEL, ESCALATE, or stack SHEPHERD. A crossed quota warning returns its `WAIT` or `MARK_READY` early so the caller can apply the warning cadence.

```sh
pr-shepherd 42 --interval 60s --timeout 4.5m --quiet-status
pr-shepherd 42 --until-terminal --quiet-status
pr-shepherd 42 --debounce 5m
pr-shepherd iterate 42 --ready-delay 15m
pr-shepherd 42 --merge
pr-shepherd 42 43 44
pr-shepherd --stack 43
```

### Flags

| Flag                                   | Applies to                   | Default / notes                                                                                                                                                                                                   |
| -------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--interval <duration>`                | poll                         | `poll.intervalSeconds` (built-in 60). `--stack` and multi-PR polls multiply it by `poll.stackIntervalFactor` (built-in 2, so 120s) unless `--interval` is set; it is not multiplied again.                        |
| `--timeout <duration>`                 | poll                         | `poll.timeoutSeconds` (270). Ignored for WAIT ticks under `--until-terminal`; does not cut an in-flight debounce short.                                                                                           |
| `--debounce <duration>`                | poll                         | `poll.debounceSeconds` (60). Settle window after the first `FIX_CODE` or stack `SHEPHERD`; `0` disables.                                                                                                          |
| `--quiet-status` / `--no-quiet-status` | poll                         | `poll.quietStatus` (`false`). By default each `WAIT` tick writes a stderr line naming what it waits on; stdout carries only the final action.                                                                     |
| `--until-terminal`                     | poll                         | See above. The shipped skill's canonical form.                                                                                                                                                                    |
| `--stack PR`                           | poll                         | Select the PR's complete native stack.                                                                                                                                                                            |
| `--ready-delay <duration>`             | iterate                      | `watch.readyDelayMinutes` (10).                                                                                                                                                                                   |
| `--stall-timeout <duration>`           | iterate                      | `iterate.stallTimeoutMinutes` (60); `0` disables.                                                                                                                                                                 |
| `--merge`                              | iterate                      | Shepherd through readiness, then emit a merge or merge-queue command.                                                                                                                                             |
| `--no-auto-mark-ready`                 | iterate                      | Do not convert drafts to ready for review.                                                                                                                                                                        |
| `--no-auto-cancel-actionable`          | iterate                      | Legacy no-op; workflow runs are never cancelled.                                                                                                                                                                  |
| `--instructions inline\|playbook`      | iterate                      | `iterate.instructions` (`inline`). `playbook` folds `fix_code`'s invariant commit/push and journal steps into one pointer to the "Fix-code loop" playbook.                                                        |
| `--poll-mode auto\|poll\|event`        | iterate                      | `poll.mode` (`auto`). `event` (or `auto` under `CLAUDE_CODE_REMOTE=true`) runs one tick with no sleeping or debounce, ignores the polling flags, and prints `pollMode` and `nextCheck`; see [cloud.md](cloud.md). |
| `--transport auto\|graphql\|rest`      | all                          | `github.transport` (`auto`). See [api.md](api.md).                                                                                                                                                                |
| `--format text\|json`                  | all except `journal extract` | `text` (Markdown). `journal extract` always prints JSON and rejects `--format`.                                                                                                                                   |
| `--verbose`                            | iterate/poll                 | Verbose iterate fields and detailed per-tick lines.                                                                                                                                                               |
| `--help` / `-h`                        | all                          | Print usage and exit 0 before any I/O.                                                                                                                                                                            |

Durations accept `s`, `m`, and `h` (`30s`, `4.5m`, `1h`). Bare polling durations are seconds; bare iterate durations are minutes. `poll.reconcileSeconds` (900) has no flag; it caps how long an idle GraphQL wait replays its last snapshot (see [graphql.md](graphql.md#idle-wait-change-detectors)). Config keys: [configuration.md](configuration.md).

## Aggregate selectors

Explicit PR sets and native stacks use a compact read-only summary rather than running the stateful one-PR iterator for every row. Aggregate polling returns when work is needed, every selected PR is complete, or timeout expires. Its Markdown, JSON, API, and MCP result has one row per PR with raw state, bounded check/review counts, and routing context.

- **Explicit PR sets** include an exact one-PR `pollCommand` for each actionable row, which callers may handle independently. When every row is `CANCEL` or `ESCALATE`, the instructions say to stop after reporting the handoffs.
- **`--stack`** never performs GitHub mutations and never emits rebase or push commands. When any layer is draft, lacks a current one-PR READY receipt, conflicts, fails checks, remains pending, or has stale ancestry, the result is `SHEPHERD` naming a one-PR session for every such layer at once. A clean draft is marked ready by its own session without waiting for lower layers. With automatic mark-ready disabled, draft layers get bounded probe commands (`pollProbe`), and the agent marks a clean draft ready with `gh pr ready` after its probe confirms the disabled setting is the only hold.
- A queued stack, or one whose remaining layers can only wait on CI, merge state, or a blocking review, returns `WAIT` until that state stays unchanged past `--stall-timeout`, then `ESCALATE` with `stall-timeout`. A terminal READY or fully merged stack returns `CANCEL`. Closed or unverified topology returns `ESCALATE` only after every other shepherdable layer has completed; mixed states return immediate `SHEPHERD` and surface the eventual human blocker.
- **`--stack --merge`**: once the bottom open layer targets the stack base, the highest open layer whose open lower layers are all READY returns `MERGE` with a command that lands that layer and every unmerged layer below it (`gh stack merge <PR number> --yes --squash` in GraphQL mode, with the method from `merge.method` or repository settings; a SHA-pinned `pr-shepherd apply merge` in REST mode). A merge queue queues that prefix together and evaluates each layer from the bottom; a failure ejects that layer and the layers above it. Reconciliation continues until every layer merges and returns `CANCEL`. JSON/MCP includes the same raw ancestry, routing context, `nextAction`, and instructions that Markdown renders.

Full aggregate semantics: [actions.md](actions.md).

## MCP server

Install and configure the stdio server in Claude Code, Codex, or Grok with [mcp.md](mcp.md). The plugin and a manual `pr-shepherd-mcp` registration both run:

```text
npx --yes --package pr-shepherd@<version> pr-shepherd-mcp
```

| Tool                       | CLI counterpart                                                  |
| -------------------------- | ---------------------------------------------------------------- |
| `iterate`                  | `pr-shepherd iterate` (one tick; MCP clients own recurrence)     |
| `apply`                    | `pr-shepherd apply merge\|review\|files\|journal\|queue-removal` |
| `playbook`                 | `pr-shepherd playbook`                                           |
| `extract_journal`          | `pr-shepherd journal extract` (takes a `body` string)            |
| `get_journal`              | none (fetches the PR body, then extracts)                        |
| `build_suggestion_patches` | `pr-shepherd build-suggestion-patches`                           |
| `build_suggestion_patch`   | deprecated one-item adapter                                      |

`admin clean` and `admin log-file` are shell administration commands, not MCP tools. Do not call a long-running polling tool: call `iterate` again after the returned work is complete or when the client's scheduler rechecks.

## CLI aliases

`poll`, `resolve`, `build-suggestion-patch`, `commit-suggestion`, `mark-files-as-viewed`, `journal`, `clean`, and `log-file` are deprecated CLI aliases or adapters for the default poll command, `apply review`, `build-suggestion-patches`, `apply files`, `apply journal`, `admin clean`, and `admin log-file`. Prefer MCP `iterate`, `apply`, and `build_suggestion_patches` for agent integrations.

## Exit codes

All CLI commands honor `--help`/`-h` before I/O. Iterate/poll PR outcomes use exit codes `0` and `10`–`16`; command, validation, and GitHub failures use `sysexits.h` codes. See [exit-codes.md](exit-codes.md).
