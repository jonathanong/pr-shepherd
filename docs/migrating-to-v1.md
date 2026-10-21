# Migrating to v1

[← README](../README.md) | [configuration.md](configuration.md)

This page lists every breaking change between pr-shepherd 0.x (0.60.1) and 1.0.0, and what to change. It is for anyone who upgrades a repository config, a script, an MCP client, or a library caller. v1 keeps no compatibility aliases. An old command, flag, field, or tool name fails or is simply absent. Renamed config keys fail with an error that names the new key. `--stack` and `--poll-mode` on the default command, `iterate`, or `stack` fail with an error that names the replacement. Removed keys with no replacement, and `--poll-mode` on other commands, fail as unknown.

If you use only the shipped plugin and skill, upgrade the plugin and migrate your config files. The skill already emits the v1 commands.

## Config

### Files

Each directory may hold **one** config file, using any of these names:

- `.pr-shepherdrc.yml` (the only name 0.x read)
- `.pr-shepherdrc.yaml` (new)
- `.pr-shepherd/config.yml` (new; sits next to `.pr-shepherd/classification/`)
- `.pr-shepherd/config.yaml` (new)

Two config files in the same directory is an error. The merge order is unchanged: built-in defaults, then `$HOME`, then each ancestor down to cwd, with the closest file winning. Your `~/.pr-shepherdrc.yml` applies to every repository, so migrate it too. Details: [How files load](configuration.md#how-files-load).

### Format version

Every non-empty config file must now start with `version: 1`. 0.x files have none, so add it when you rename their keys. A non-empty file without it fails with exit code `78`. An empty file needs none. A higher version, such as `version: 2`, fails with a message saying the file needs a newer pr-shepherd. Details: [Version](configuration.md#version).

### Strict validation

In 0.x, problems were mostly warnings. A file with a YAML syntax error was skipped while other files still merged, and an unknown key was dropped while the rest of its file applied. Only a merged config that failed validation fell back entirely to the built-in defaults. So an old warning does not always mean every configured value was inactive. In v1, Shepherd validates config before any GitHub call and exits with code `78` (`EX_CONFIG`) on any of these:

- an unknown key, including every renamed or removed pre-v1 key (`github.transport`, `iterate.instructions`, `merge.method`, and `classify.standard` keep their names and stay valid)
- a value of the wrong type or out of range
- an invalid regex
- a YAML syntax error
- a top level that is not a mapping
- more than one config file in one directory

Shepherd stops at the first invalid file. The message names that file and the key path of each problem in it, but a YAML syntax error, a non-mapping top level, or a duplicate config file has no key path. Fix it and rerun to see problems in later files, such as a repository config after `~/.pr-shepherdrc.yml`. A pre-v1 key never takes effect, but the error names the key that replaced it:

```text
pr-shepherd: invalid config in /repo/.pr-shepherdrc.yml:
  - `watch.readyDelayMinutes` → `iterate.ready-delay-minutes`
```

The library and the MCP server validate the same way before any GitHub I/O. A library call rejects with that error, and an MCP tool call returns it as an error result. Details: [Validation](configuration.md#validation).

### Key renames

Every key is now kebab-case. A duration carries its unit in its name, and no key takes milliseconds.

| 0.x key                                         | v1 key                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `cliCommand`                                    | `cli-command`                                                          |
| `botUsernames`                                  | `bot-usernames`                                                        |
| `ignoreChecks`                                  | `checks.ignore`                                                        |
| `actions.neverCancelRuns`                       | `checks.never-ignore`                                                  |
| `checks.ciTriggerEvents`                        | `checks.ci-trigger-events`                                             |
| `checks.ignoreLogLines`                         | `checks.ignore-log-lines`                                              |
| `iterate.fixAttemptsPerThread`                  | `iterate.triage-attempts-per-thread`                                   |
| `iterate.stallTimeoutMinutes`                   | `iterate.stall-timeout-minutes`                                        |
| `watch.readyDelayMinutes`                       | `iterate.ready-delay-minutes`                                          |
| `iterate.minimizeApprovals`                     | `iterate.minimize-approvals`                                           |
| `iterate.minimizeComments`                      | `iterate.minimize-comments`                                            |
| `iterate.behindBaseHint`                        | `iterate.behind-base-hint`                                             |
| `iterate.resolveOtherHumanThreads`              | `iterate.resolve-other-human-threads`                                  |
| `iterate.reviewOutputMaxChars`                  | `iterate.review-output-max-chars`                                      |
| `poll.intervalSeconds`                          | `poll.interval-seconds`                                                |
| `poll.stackIntervalFactor`                      | `poll.stack-interval-factor`                                           |
| `poll.timeoutSeconds`                           | `poll.timeout-seconds`                                                 |
| `poll.debounceSeconds`                          | `poll.debounce-seconds`                                                |
| `poll.quietStatus`                              | `poll.quiet-status`                                                    |
| `poll.reconcileSeconds`                         | `poll.reconcile-seconds`                                               |
| `watch.graphqlQuotaWarnings`                    | `poll.quota-warnings`                                                  |
| `watch.graphqlQuotaWarnings[].remainingPercent` | `poll.quota-warnings[].remaining-percent`                              |
| `…[].pollIntervalMinutes`                       | `poll.quota-warnings[].interval-minutes`                               |
| `…[].pollIntervalFactor`                        | `poll.quota-warnings[].interval-factor`                                |
| `resolve.shaPoll.intervalMs`                    | `apply.sha-poll-interval-seconds` (in **seconds**: `2000` becomes `2`) |
| `resolve.shaPoll.maxAttempts`                   | `apply.sha-poll-max-attempts`                                          |
| `mergeStatus.blockingReviewerLogins`            | `mark-ready.blocking-reviewer-logins`                                  |
| `actions.autoMarkReady`                         | `mark-ready.auto`                                                      |
| `merge.commandArgs`                             | `merge.command-args`                                                   |
| `actions.autoMinimizeSuppressed`                | `actions.auto-minimize-suppressed`                                     |
| `actions.workWhileQueued`                       | `actions.work-while-queued`                                            |

These keys keep their names: `github.transport`, `iterate.instructions`, `merge.method`, and `classify.standard`.

These have no replacement:

| 0.x key or value                   | v1                                                                    |
| ---------------------------------- | --------------------------------------------------------------------- |
| `poll.mode`                        | Removed. The error says to use `pr-shepherd iterate` for single ticks |
| `actions.autoResolveOutdated`      | Unknown key; delete it                                                |
| `actions.commitSuggestions`        | Unknown key; delete it                                                |
| `iterate.minimize-comments: users` | Invalid value; use `all`, `bots`, or `none`                           |

A migrated file looks like this:

```yaml
version: 1
checks:
  ignore:
    - "Kilo*"
iterate:
  triage-attempts-per-thread: 5
  ready-delay-minutes: 10
poll:
  quota-warnings:
    - remaining-percent: 20
      interval-factor: 5
apply:
  sha-poll-interval-seconds: 2
mark-ready:
  blocking-reviewer-logins:
    - copilot
```

### New defaults

Three defaults changed. To keep the 0.x behavior, set each key explicitly:

| Key                                   | 0.x default   | v1 default |
| ------------------------------------- | ------------- | ---------- |
| `iterate.ready-delay-minutes`         | `10`          | `0`        |
| `iterate.minimize-comments`           | `"all"`       | `"bots"`   |
| `mark-ready.blocking-reviewer-logins` | `["copilot"]` | `[]`       |

With a ready delay of `0`, a loop cancels or merges on the first clean READY tick instead of counting down.

### JSON Schema

The npm package now ships `pr-shepherd.schema.json`, generated from the same validator. For completion and inline validation in editors that use the YAML language server, add this first line to your config file:

```yaml
# yaml-language-server: $schema=./node_modules/pr-shepherd/pr-shepherd.schema.json
```

The path is relative to the config file, so in `.pr-shepherd/config.yml` use `../node_modules/pr-shepherd/pr-shepherd.schema.json`.

Every key, default, and per-key section is in [configuration.md](configuration.md).

## Commands

### Renamed and split commands

| 0.x                                                                    | v1                                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pr-shepherd --stack PR [flags]`                                       | `pr-shepherd stack PR [flags]`; `--once` runs one aggregate tick |
| `pr-shepherd iterate [PR]` (`nextCheck` only with `--poll-mode event`) | `pr-shepherd iterate [PR ...]`, with `nextCheck`                 |
| `pr-shepherd build-suggestion-patches …`                               | `pr-shepherd suggest …` (same flags)                             |
| Playbook `Fix-code loop` (`fix-code-loop`)                             | `Triage loop` (`triage-loop`)                                    |
| Playbook `Cloud event loop` (`cloud-event-loop`)                       | `Event loop` (`event-loop`)                                      |

- `stack` owns the `shepherd` action and exit code `16`. Passing `--stack` to the default command or to `iterate` now exits `64` with an error that names `pr-shepherd stack <PR>`.
- `iterate` is always one tick, accepts several same-repository PRs for one aggregate tick, and prints `nextCheck` when the action waits: when to rerun if no GitHub event arrives first (see the omissions below). It behaves like 0.x `--poll-mode event`. It never sleeps or debounces, and it writes seen markers immediately. See [cloud.md](cloud.md).
- `--poll-mode` and `poll.mode` are removed. On the default command, `iterate`, and `stack`, `--poll-mode` exits `64` with an error that names the replacement. On `admin clean` and `admin log-file` it is just an unknown flag (exit `64`), so drop it there. There is no mode to configure. The default command `pr-shepherd [PR ...]` and `stack` loop by default. They run one tick in a Claude Code cloud session (`CLAUDE_CODE_REMOTE=true`), and `stack` also runs one tick with `--once`.
- Multi-PR polling is unchanged: `pr-shepherd 1 2 3`.

### Removed aliases

Most of these aliases printed a deprecation warning in 0.x. In v1 they are all unknown subcommands (exit `64`).

| Removed alias                          | Use                           |
| -------------------------------------- | ----------------------------- |
| `pr-shepherd poll [PR]`                | `pr-shepherd [PR]`            |
| `pr-shepherd resolve …`                | `pr-shepherd apply review …`  |
| `pr-shepherd mark-files-as-viewed …`   | `pr-shepherd apply files …`   |
| `pr-shepherd journal …` (append)       | `pr-shepherd apply journal …` |
| `pr-shepherd build-suggestion-patch …` | `pr-shepherd suggest …`       |
| `pr-shepherd commit-suggestion …`      | `pr-shepherd suggest …`       |
| `pr-shepherd clean …`                  | `pr-shepherd admin clean …`   |
| `pr-shepherd log-file`                 | `pr-shepherd admin log-file`  |

`pr-shepherd journal extract --body-file <path>` remains.

`suggest` is batch-shaped. Scripts that read the JSON from `build-suggestion-patch` or `commit-suggestion` must read `threadId`, `path`, `patch`, and the other per-suggestion fields from `patches[0]` instead of the top level, and its instructions cover the whole batch.

### Removed flags

| Removed flag                    | Replacement                                                     |
| ------------------------------- | --------------------------------------------------------------- |
| `--stack PR`                    | The `stack` subcommand                                          |
| `--poll-mode auto\|poll\|event` | `pr-shepherd iterate` for one tick; the default command to loop |
| `--no-auto-cancel-actionable`   | None. It was a no-op; Shepherd never cancels workflow runs      |

`--no-auto-cancel-actionable` and other unknown flags exit `64`. `iterate` and `apply review` reject an unknown flag before they resolve the PR.

## Actions, output, and exit codes

| 0.x                                                                  | v1                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| Action `fix_code`, text header `[FIX_CODE]`                          | Action `triage`, text header `[TRIAGE]`            |
| Exit code `12` (`FIX_CODE`)                                          | Exit code `12` (`TRIAGE`); the number is unchanged |
| JSON `fix` block (`fix.threads`, `fix.checks`, `fix.reviewItems`, …) | JSON `triage` block, with the same fields          |
| Escalation trigger `fix-thrash`                                      | `triage-thrash`                                    |
| Playbook pointer `Playbook: "Fix-code loop".`                        | `Playbook: "Triage loop".`                         |
| Playbook pointer `Playbook: "Cloud event loop".`                     | `Playbook: "Event loop".`                          |
| Invalid config: warning, then defaults                               | Exit code `78` (`EX_CONFIG`)                       |

`triage` is the same state as `fix_code`, renamed because the work is often a reply, a thread resolution, or CI triage rather than a code change. It is still always non-terminal.

Removed result fields:

| Result                           | Removed fields                                                                                                                                                                                                                                         | Why                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `iterate` triage result          | `fix.inProgressRunIds`, `fix.protectedRuns`, and the top-level `cancelled`                                                                                                                                                                             | Always empty; Shepherd never cancels runs  |
| `iterate` and aggregate results  | `pollMode`                                                                                                                                                                                                                                             | Modes are gone; `nextCheck` marks a tick   |
| `apply review` (`ResolveResult`) | `skippedDismissals`, `skippedHumanResolves`, `skippedHumanMinimizes`, `skippedHumanDismissals`, `skippedNonHumanReplies`, `skippedUnauthorizedReplies`, `skippedUnauthorizedResolves`, `skippedUnauthorizedMinimizes`, `skippedUnauthorizedDismissals` | Deprecated; direct apply forwards every ID |
| `apply files`, `apply journal`   | `authorizationSkipped`                                                                                                                                                                                                                                 | Deprecated                                 |

On a single tick, `nextCheck` is omitted for `triage`, for `mark_ready`, and for terminal actions. After `triage` or `mark_ready`, rerun immediately: after `mark_ready` the next tick sees the ready PR and starts any ready delay; [actions.md](actions.md#single-ticks) has the full rule.

## MCP tools and library API

| 0.x                                                       | v1                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| MCP `iterate` with `stack`                                | MCP `stack` with `pr`                                                               |
| MCP `iterate` with `pr` or `prs`                          | Same inputs; always one tick, with `nextCheck` as described above and no `pollMode` |
| MCP `build_suggestion_patches`                            | MCP `suggest`                                                                       |
| MCP `build_suggestion_patch`                              | Removed; use `suggest` with one suggestion                                          |
| `shepherd.iterate({ stack })`                             | `shepherd.stack({ pr })`                                                            |
| `shepherd.buildSuggestionPatches(input)`                  | `shepherd.suggest(input)`                                                           |
| `shepherd.buildSuggestionPatch(input)`                    | Removed; use `suggest` with one suggestion                                          |
| Input option `pollMode`                                   | Removed; MCP and library calls are always one tick                                  |
| Input options `noAutoCancelActionable`, `neverCancelRuns` | Removed; they were no-ops                                                           |
| No `check_blocker` apply operation                        | MCP `apply` and `shepherd.apply` accept `check_blocker`                             |

The new `check_blocker` operation matches `pr-shepherd apply check-blocker`:

```ts
await shepherd.apply({
  pr: 42,
  operations: [{ type: "check_blocker", check: "e2e", blockedBy: "owner/repo#77" }],
});
```

Pass `clear: true` instead of `blockedBy` to clear the blocker.

Exported types from `pr-shepherd`:

| 0.x type                                      | v1 type                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `AggregateIterateInput`                       | `MultiIterateInput` (for `prs`) and `StackInput` (for `stack()`) |
| `BuildSuggestionPatchesInput`                 | `SuggestInput`                                                   |
| `BuildSuggestionPatchesResult` (not exported) | `SuggestResult`                                                  |
| `IterateResultFixCode` (not exported)         | `IterateResultTriage`                                            |
| `BuildSuggestionPatchInput`                   | Removed                                                          |

The package entry point now also re-exports the result and action types: `IterateResult`, `IterateResultTriage`, `IterateResultMerge`, `PollSummaryResult`, `PollSummaryItem`, `ShepherdAction`, `ShepherdStatus`, `ShepherdMergeStatus`, `StackNextAction`, `NextCheck`, `CancelReason`, `SuggestResult`, `SuggestionPatchResult`, `ResolveResult`, `ApplyMergeResult`, `MarkFilesAsViewedResult`, `JournalResult`, `ApplyQueueRemovalResult`, `CheckBlockerCommandResult`, `ShepherdJournalExtraction`, and the new `CheckBlockerOperation`. See [api.md](api.md) and [mcp.md](mcp.md).

## Local state

The first run after the upgrade starts partly clean. Nothing needs to be deleted by hand, but expect these one-time effects:

- **Seen markers without an `id` field are ignored.** These are filename-keyed markers from old builds. Their review threads and comments surface once more as first-look items, and Shepherd writes a current marker.
- **The stored PR fingerprint is discarded.** Its version changed, so the first tick per PR runs the full batched query instead of skipping on an unchanged fingerprint.
- **Local event-mode state is no longer read** unless `PR_SHEPHERD_STATE_DIR` was set. That variable takes priority in both 0.x and v1, so with it set nothing moves and this item and the cleanup below do not apply. Without it, 0.x event mode (`--poll-mode event`, `poll.mode: event`, or the MCP and library `pollMode: "event"`) kept seen markers, stall timers, and reply records under `<git-common-dir>/pr-shepherd-state` on any machine. v1 uses that directory only when `CLAUDE_CODE_REMOTE=true`. A local `iterate` uses the normal state directory, so state written by local event-mode runs is not carried over.

Triage attempt counts (`fix-attempts.json`) and merge requests carry over when the state directory is unchanged. Local event-mode runs kept them under `<git-common-dir>/pr-shepherd-state`, so after such runs they start fresh with the rest of that state. The full per-thread budget (`iterate.triage-attempts-per-thread`, default 3) starts over, so an unchanged thread can come back in that many more `TRIAGE` results before Shepherd escalates. To start fully clean, run `pr-shepherd admin clean all`. That cleans the normal state directory only. If you used local event mode without `PR_SHEPHERD_STATE_DIR`, also delete the legacy directory, which would otherwise come back into use under `CLAUDE_CODE_REMOTE=true`: `rm -rf "$(git rev-parse --git-common-dir)/pr-shepherd-state"`.
