# pr-shepherd CLI reference

[← README](../README.md)

Run any command with `--help` or `-h` for the built-in usage text. Help exits before GitHub, git, config, cleanup, or log I/O.

```text
pr-shepherd --version | -v
pr-shepherd --help | -h
pr-shepherd [PR] [poll-flags] [iterate-flags]
pr-shepherd iterate [PR] [iterate-flags]
pr-shepherd poll [PR] [poll-flags] [iterate-flags]
pr-shepherd resolve [PR] [resolve-flags]
pr-shepherd commit-suggestion [PR] --thread-id ID --message MSG [--description DESC]
pr-shepherd mark-files-as-viewed [PR] [files...] [--tests] [--match REGEX]
pr-shepherd clean <pr|branch|current|repo|all> [value] [--dry-run] [--format text|json]
pr-shepherd log-file [--format text|json]
```

`PR` may be a number or GitHub pull request URL. When omitted, Shepherd infers the current branch's open PR.

## Poll And Iterate

`pr-shepherd [PR]` is the default poll dispatcher and is equivalent to `pr-shepherd poll [PR]`. It runs iterate ticks while the action is `WAIT`, then prints the final tick when the action becomes `MARK_READY`, `FIX_CODE`, `CANCEL`, or `ESCALATE`, or when `--timeout` returns the last `WAIT`.

`pr-shepherd iterate [PR]` runs one tick and prints one action. See [actions.md](actions.md) for the full output contract.

```sh
pr-shepherd 42
pr-shepherd 42 --interval 60s --timeout 4.5m
pr-shepherd 42 --interval 60s --timeout 4.5m --quiet-status
pr-shepherd 42 --until-terminal --quiet-status
pr-shepherd 42 --ready-delay 15m
pr-shepherd iterate 42
pr-shepherd poll 42 --format=json
```

### Iterate Flags

| Flag                          | Default                       | Description                                                                                                     |
| ----------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `--ready-delay <duration>`    | `watch.readyDelayMinutes`     | Settle window before a clean handoff cancels. Bare number = minutes. Example: `15m` or `900s`.                  |
| `--stall-timeout <duration>`  | `iterate.stallTimeoutMinutes` | Escalate repeated unchanged state or unstarted CI. Bare number = minutes; `0` disables. Example: `1h` or `60s`. |
| `--no-auto-mark-ready`        | false                         | Do not convert draft PRs to ready for review.                                                                   |
| `--no-auto-cancel-actionable` | false                         | Do not cancel in-progress runs before actionable fixes.                                                         |
| `--format text\|json`         | `text`                        | Output Markdown text or JSON.                                                                                   |
| `--verbose`                   | false                         | Include verbose iterate fields; poll also prints detailed ticks.                                                |

Use `actions.neverCancelRuns` in `.pr-shepherdrc.yml` for workflow/check names whose Actions workflow runs should never be cancelled, while keeping normal auto-cancel behavior for everything else.

### Poll Flags

| Flag                    | Default | Description                                                                         |
| ----------------------- | ------- | ----------------------------------------------------------------------------------- |
| `--interval <duration>` | `60s`   | Sleep between `WAIT` ticks.                                                         |
| `--timeout <duration>`  | `4.5m`  | Maximum wall-clock wait before returning the latest `WAIT` result.                  |
| `--quiet-status`        | `false` | Print only changed WAIT snapshots instead of one dot per tick.                      |
| `--until-terminal`      | `false` | Continue through `WAIT` and `MARK_READY` until `FIX_CODE`, `CANCEL`, or `ESCALATE`. |

Durations accept `s`/`m`/`h` suffixes and decimals: `30s`, `4.5m`, `1h`. A bare number uses each flag's
default unit — seconds for `--interval`/`--timeout` (e.g. `45`), minutes for `--ready-delay`/`--stall-timeout`
(e.g. `15`) — but an explicit unit always works everywhere (e.g. `--stall-timeout 60s`).

With `--until-terminal`, `--timeout` is ignored for `WAIT` ticks so the poll can stay attached until work or terminal state appears.

Exit codes for iterate and poll: `0` `WAIT`/`MARK_READY`, `1` `FIX_CODE` or command error, `2` `CANCEL`, `3` `ESCALATE`.

## Resolve

`resolve` applies explicit GitHub review-state mutations after an iterate/fix step. At least one non-empty action flag is required; use `pr-shepherd iterate` or `pr-shepherd poll` to fetch the next PR action and printed instructions.

```sh
pr-shepherd resolve 42 \
  --reply-thread-ids PRRT_human \
  --resolve-thread-ids PRRT_bot \
  --minimize-comment-ids IC_bot,PRR_summary \
  --dismiss-review-ids PRR_changes_requested \
  --message "Switched query construction to parameterized SQL." \
  --require-sha "$(git rev-parse HEAD)"
```

| Flag                     | Description                                                          |
| ------------------------ | -------------------------------------------------------------------- |
| `--reply-thread-ids`     | Comma-separated human review thread IDs to reply to.                 |
| `--resolve-thread-ids`   | Comma-separated non-human/manual review thread IDs to mark resolved. |
| `--minimize-comment-ids` | Comma-separated issue comment or review IDs to minimize.             |
| `--dismiss-review-ids`   | Comma-separated `CHANGES_REQUESTED` review IDs to dismiss.           |
| `--message`              | Required with replies or dismissals; must describe the specific fix. |
| `--require-sha`          | Poll GraphQL `headRefOid` until GitHub reports this PR head SHA.     |
| `--format text\|json`    | Output format.                                                       |

Before running a reply mutation, agents must remove any thread from `--reply-thread-ids` when the latest visible thread comment is their own prior Shepherd reply.

Mutation batches are sent in chunks of 10. On a primary or secondary GitHub rate-limit response, Shepherd stops and reports completed IDs plus pending IDs to retry later.

Review-summary IDs (`PRR_…`) go to `--minimize-comment-ids`, never `--dismiss-review-ids`.

## Commit Suggestion

`commit-suggestion` turns one review thread containing exactly one GitHub ` ```suggestion ` block into a patch, commit metadata, and numbered instructions. It does not edit files or mutate git history.

```sh
pr-shepherd commit-suggestion 42 \
  --thread-id PRRT_abc \
  --message "rename value for clarity" \
  --description "Optional longer body."
```

Preconditions:

- Current branch matches the PR head branch.
- Local `HEAD` matches the PR head SHA.
- Target file is clean.
- Thread is active, locatable, unresolved, not outdated, and not minimized.

The output includes a unified diff, a suggested commit subject/body with reviewer attribution, files to stage, and post-action instructions. Invoke once per suggestion thread. If a reviewer's suggestion box contains more lines than the highlighted range, the emitted diff trims leading/trailing lines that merely duplicate adjacent file context, so the patch applies cleanly without duplicating lines.

Exit codes: `0` suggestion produced, `1` validation/lookup/precondition/parsing failure.

## Mark Files As Viewed

Marks changed files as viewed in the GitHub PR diff using GraphQL.

```sh
pr-shepherd mark-files-as-viewed 42 src/a.ts src/b.test.ts
pr-shepherd mark-files-as-viewed 42 --tests
pr-shepherd mark-files-as-viewed 42 --match '^docs/' --match '\\.md$'
```

Selectors expand against GitHub's changed-file list:

- Exact path arguments must match changed-file paths.
- `--tests` selects common test paths and suffixes.
- `--match <regex>` is repeatable and case-insensitive.

Mutation batches are sent in groups of 10 and stop on GitHub rate limits with completed and pending file lists.

## Log File

Prints the per-worktree append-only debug log path. The first non-help command that initializes logging creates the file.

```sh
pr-shepherd log-file
pr-shepherd log-file --format=json
```

Logs include session headers, GraphQL request/response bodies, REST JSON request/response bodies, REST text metadata, and full CLI stdout. Auth headers are never logged.

Set `PR_SHEPHERD_LOG_DISABLED=1` to disable logging. `PR_SHEPHERD_STATE_DIR` overrides the base state/log directory.

## Clean

Removes local Shepherd state from `$PR_SHEPHERD_STATE_DIR` (default `$TMPDIR/pr-shepherd-state`).

```sh
pr-shepherd clean current
pr-shepherd clean pr 42
pr-shepherd clean branch feature/foo
pr-shepherd clean repo
pr-shepherd clean all
pr-shepherd clean current --dry-run
pr-shepherd clean repo --format=json
```

| Variant         | What it removes                                                 |
| --------------- | --------------------------------------------------------------- |
| `pr [number]`   | One PR's state; defaults to current branch PR.                  |
| `branch [name]` | Resolves a branch to its open PR, then removes that PR's state. |
| `current`       | Alias for `branch` against the current branch.                  |
| `repo`          | All state for the current repository, including worktree logs.  |
| `all`           | All `pr-shepherd` state under the base directory.               |

`--dry-run` previews paths without deleting them. A nonexistent target exits `0` and reports nothing to clean.
