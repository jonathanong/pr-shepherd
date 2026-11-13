# pr-shepherd configuration

[← README](../README.md)

Every config-file key and environment variable Shepherd reads, with its default and effect.

## How files load

The CLI and the MCP server read the same files. Each directory may hold **one** config file, using any of these names:

- `.pr-shepherdrc.yml`
- `.pr-shepherdrc.yaml`
- `.pr-shepherd/config.yml`
- `.pr-shepherd/config.yaml`

Two config files in the same directory is an error. Keep exactly one.

Shepherd collects files in this order, from farthest to closest:

1. The built-in defaults.
2. The `$HOME` config file. It applies even when cwd is outside `$HOME`. In that case the walk covers cwd's ancestors but stops before the filesystem root, so a root-level file cannot override the user file.
3. Each ancestor directory's file, going down toward cwd.
4. The cwd file.

Files deep-merge ESLint-style:

- Closer files override farther ones.
- Nested objects merge key by key.
- Arrays replace each other rather than combining.

Every non-empty file starts with `version: 1` (see [Version](#version)). Every other key is optional. The built-in defaults in `src/config/schema.mts` fill in the rest.

For example, if `$HOME` sets `checks.ignore` and `iterate.stall-timeout-minutes`, and the repository sets `iterate.triage-attempts-per-thread: 5`, the result has all three. If both files set `checks.ignore`, the closer list replaces the farther one.

### Validation

Config follows GitHub Actions conventions. Keys are kebab-case. A duration key carries its unit in its name, such as `interval-seconds` or `ready-delay-minutes`; no key takes milliseconds. Validation is strict, so a bad config never falls back silently.

Shepherd validates config before it makes any GitHub call. Any of the following exits with code `78` (`EX_CONFIG`):

- a missing or unsupported `version`
- an unknown key
- a value of the wrong type or out of range
- an invalid regex
- a YAML syntax error
- a top level that is not a mapping

The message names the file and the key path of every problem:

```text
pr-shepherd: invalid config in /repo/.pr-shepherdrc.yml:
  - `iterate.ready-delay-minutes`: Too small: expected number to be >=0
  - `watch.readyDelayMinutes` → `iterate.ready-delay-minutes`
```

Shepherd validates each file on its own. After merging the files, it runs these checks, which span more than one key:

- `poll.interval-seconds × poll.stack-interval-factor` must be at most `2147483.647` seconds, the longest delay a timer can hold.
- Every `poll.quota-warnings` band must resolve to a finite interval. The resolved interval must not decrease as `remaining-percent` decreases.
- `merge.method` and the strategy flag in `merge.command-args` must name the same method.

When one of these checks fails, the message lists every contributing file.

A pre-v1 key never takes effect. The error names its replacement, as in the example above. See [Migrating from pre-v1 keys](#migrating-from-pre-v1-keys).

### Version

`version` is the config format version. It matches the semver major of the pr-shepherd release that reads it. This release reads `version: 1`. Files from 0.x have no `version`; add `version: 1` when you rename their keys.

- A non-empty file without `version` is an error. An empty file needs none.
- A file with a higher version, such as `version: 2`, fails with a message saying it needs a newer pr-shepherd. Shepherd reports nothing else about that file, because a newer format may add or rename keys.
- Any other value is an error.

### Editor autocompletion

The npm package ships `pr-shepherd.schema.json`, generated from the validator Shepherd uses. For completion and inline validation in editors that use the YAML language server, add this first line to your config file:

```yaml
# yaml-language-server: $schema=./node_modules/pr-shepherd/pr-shepherd.schema.json
```

Adjust the relative path for files outside the repository root, or for a global install.

## Example

A config that overrides a few defaults. The [table below](#all-supported-keys) lists every key.

```yaml
version: 1

cli-command: [pnpm, exec, pr-shepherd]

checks:
  ignore:
    - "Kilo*"
  never-ignore:
    - "Final Code Review"

iterate:
  triage-attempts-per-thread: 5
  ready-delay-minutes: 10
  behind-base-hint: "rebase --force-with-lease"

poll:
  interval-seconds: 120

mark-ready:
  blocking-reviewer-logins: [copilot, sonar]

merge:
  method: squash
  command-args: [--delete-branch]

classify:
  standard:
    all: true
```

## All supported keys

| Key                                   | Default                                   | Purpose                                                                                                                                                            |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `github.transport`                    | `"auto"`                                  | `auto`, `graphql`, or `rest`. See [GitHub API transport](#github-api-transport).                                                                                   |
| `cli-command`                         | `["pr-shepherd"]`                         | Argv prefix for every `pr-shepherd` command Shepherd emits.                                                                                                        |
| `bot-usernames`                       | Known code-review bot logins              | Logins treated as bots even when GitHub reports `User` or `Unknown`.                                                                                               |
| `checks.ignore`                       | `[]`                                      | Case-insensitive globs excluded from CI decisions, annotations included. The names stay in the ignored rollup.                                                     |
| `checks.never-ignore`                 | `[]`                                      | Actions workflows or checks that stay visible even when they match `checks.ignore`.                                                                                |
| `checks.ci-trigger-events`            | `["pull_request", "pull_request_target"]` | Workflow `on:` events treated as PR-head CI. Merge-queue `merge_group` checks are included automatically.                                                          |
| `checks.ignore-log-lines`             | `[]`                                      | Regexes. Matching raw CI log lines are dropped from `## Failing checks` excerpts and from annotation dedup.                                                        |
| `iterate.triage-attempts-per-thread`  | `3`                                       | Number of caller-visible `TRIAGE` deliveries of one unchanged, unresolved thread before the next tick escalates.                                                   |
| `iterate.stall-timeout-minutes`       | `60`                                      | Minutes without progress, or of CI that has not started, before `escalate` / `stall-timeout`; `0` disables.                                                        |
| `iterate.ready-delay-minutes`         | `0`                                       | Settle window after READY before the loop cancels or merges. `0` cancels or merges as soon as the PR is READY.                                                     |
| `iterate.minimize-approvals`          | `false`                                   | Also minimize `APPROVED` reviews, and fetch approvals past the first 50.                                                                                           |
| `iterate.minimize-comments`           | `"bots"`                                  | Non-human author classes to minimize: `all`, `bots`, or `none`. Humans are never minimized.                                                                        |
| `iterate.behind-base-hint`            | `""`                                      | One-liner on `triage` when the branch is behind or conflicts with its base. Empty omits it.                                                                        |
| `iterate.resolve-other-human-threads` | `"none"`                                  | When to resolve other humans' threads after a reply: `none`, `outdated`, or `always`.                                                                              |
| `iterate.instructions`                | `"inline"`                                | `inline` or `playbook` for the `triage` commit/push step. `--instructions` and the MCP `instructions` input override it.                                           |
| `iterate.review-output-max-chars`     | `50000`                                   | Per-tick character budget for review-item bodies on `triage`; `0` disables it. See [Review output budget](actions.md#review-output-budget).                        |
| `events.source`                       | `"none"`                                  | `none` or `hook-harness`. `hook-harness` makes poll waits event-driven. See [hook-harness.md](hook-harness.md).                                                    |
| `events.fallback-interval-seconds`    | `300`                                     | Longest quiet wait while the event source is healthy; at most `86400`. See [hook-harness.md](hook-harness.md).                                                     |
| `poll.interval-seconds`               | `60`                                      | Delay between `WAIT` ticks for one PR. `--interval` overrides it.                                                                                                  |
| `poll.stack-interval-factor`          | `2`                                       | Multiplier for `stack` and multi-PR sleeps. `--interval` overrides it and is not multiplied.                                                                       |
| `poll.timeout-seconds`                | `270`                                     | Wall-clock cap for bounded `WAIT` polling. `--timeout` overrides it; `--until-terminal` ignores it. See [Choosing a wait mode](cli-usage.md#choosing-a-wait-mode). |
| `poll.debounce-seconds`               | `60`                                      | Settle window after the first `TRIAGE`. `--debounce` overrides it; `0` disables it.                                                                                |
| `poll.quiet-status`                   | `false`                                   | Hide unchanged `WAIT` snapshots. `--quiet-status` / `--no-quiet-status` override it.                                                                               |
| `poll.reconcile-seconds`              | `900`                                     | GraphQL transport: the maximum age of a snapshot an idle `WAIT` tick may replay when REST change detectors are unchanged. `0` disables it.                         |
| `poll.quota-warnings`                 | `30% → 2x, 20% → 5x, 10% → 10x`           | Warning bands for the GraphQL and REST core quotas, each with a minimum poll interval. `[]` disables them.                                                         |
| `apply.sha-poll-interval-seconds`     | `2`                                       | Seconds between polls while waiting for `--require-sha` to land on GitHub.                                                                                         |
| `apply.sha-poll-max-attempts`         | `10`                                      | Maximum number of `--require-sha` polls before giving up.                                                                                                          |
| `mark-ready.auto`                     | `true`                                    | Emit `mark_ready` when a draft PR reaches a clean ready state.                                                                                                     |
| `mark-ready.blocking-reviewer-logins` | `[]`                                      | Reviewer login prefixes whose pending review or review request blocks `mark_ready`.                                                                                |
| `merge.method`                        | unset                                     | Preferred method: `merge`, `squash`, or `rebase`, used only when the repository allows it. A strategy flag in `command-args` must name the same method.            |
| `merge.command-args`                  | `[]`                                      | Extra options for ordinary `gh pr merge` commands, not for queue commands. Its strategy flag is the preferred method when `merge.method` is unset.                 |
| `actions.auto-minimize-suppressed`    | `true`                                    | Resolve and minimize classification matches that set both flags, then print and report the result.                                                                 |
| `actions.work-while-queued`           | `false`                                   | Act on non-CI work immediately while the PR is in the merge queue, instead of deferring it.                                                                        |
| `classify.standard`                   | `{}`                                      | Opt-in bundled classification rules for common bot noise.                                                                                                          |

## Migrating from pre-v1 keys

v1 renamed every camelCase key. An old key is an error that names its replacement. It never takes effect, so rename each one:

| Pre-v1 key                                      | v1 key                                                                 |
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
| `iterate.reviewOutputMaxChars`                  | `iterate.review-output-max-chars`                                      |
| `iterate.resolveOtherHumanThreads`              | `iterate.resolve-other-human-threads`                                  |
| `poll.intervalSeconds`                          | `poll.interval-seconds`                                                |
| `poll.stackIntervalFactor`                      | `poll.stack-interval-factor`                                           |
| `poll.timeoutSeconds`                           | `poll.timeout-seconds`                                                 |
| `poll.debounceSeconds`                          | `poll.debounce-seconds`                                                |
| `poll.quietStatus`                              | `poll.quiet-status`                                                    |
| `poll.reconcileSeconds`                         | `poll.reconcile-seconds`                                               |
| `poll.mode`                                     | Removed. Use `pr-shepherd iterate` for single ticks.                   |
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

Three defaults also changed in v1. To keep the pre-v1 behavior, set each key explicitly:

| Key                                   | Pre-v1 default | v1 default |
| ------------------------------------- | -------------- | ---------- |
| `iterate.ready-delay-minutes`         | `10`           | `0`        |
| `iterate.minimize-comments`           | `"all"`        | `"bots"`   |
| `mark-ready.blocking-reviewer-logins` | `["copilot"]`  | `[]`       |

## GitHub API transport

Choose the transport with `github.transport`, the CLI `--transport auto|graphql|rest` option, or the equivalent library or MCP option.

| Mode      | Behavior                                                                                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto`    | REST when `CLAUDE_CODE_REMOTE=true`. Otherwise GraphQL, switching to REST for the rest of the process only after the recognized Claude Code 403, an exhausted primary GraphQL budget, or an outage that persists after bounded retries. |
| `graphql` | GraphQL only.                                                                                                                                                                                                                           |
| `rest`    | REST only.                                                                                                                                                                                                                              |

Credential failures, ordinary permission or query errors, and secondary throttling never switch transports. Both transports honor proxy configuration.

REST can return less context than GraphQL, and any field it omits stays unknown:

- A clean merge state with complete CI and complete feedback evidence can be READY without `reviewDecision` or branch-protection data.
- `reviewDecision` is never a readiness input, so its absence does not block a state that is not clean either, such as `BLOCKED` while awaiting an approval, `UNSTABLE`, or `HAS_HOOKS`.
- Unreadable branch protection or rulesets still prevent READY for a state that is not clean.

For cloud credentials, see [authentication.md](authentication.md). For transport limits and usage, see [github-api.md](github-api.md).

## `cli-command` — default `["pr-shepherd"]`

The argv prefix for every `pr-shepherd` command Shepherd emits, in Markdown, JSON, and MCP output: follow-up `stack` and per-PR session commands, `apply review` and `apply journal` mutations, and `suggest` commands.

The default assumes `pr-shepherd` is on `PATH`. A repository that pins pr-shepherd as a dependency should set its launcher, so agents run the pinned version:

```yaml
cli-command:
  - pnpm
  - exec
  - pr-shepherd
```

The value must be a non-empty list of non-empty strings. Shepherd shell-quotes each argument when it renders command text.

## `bot-usernames`

Logins Shepherd treats as bot authors. It also detects bots when GitHub reports `authorType: Bot` or the login contains `[bot]`.

- Matching is case-insensitive.
- A trailing `[bot]` is equivalent to the bare login.
- The default lists common code-review bots. See `src/config/schema.mts`.

| Thread author                | Returned each tick?                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Bot (detected or configured) | Yes, until resolved, even when it is unchanged and already seen. Bot comments and reviews follow the bot minimize policy. |
| Viewer-authored human        | Yes, until resolved.                                                                                                      |
| Other human                  | Gated by seen markers: shown again only when changed, unless `iterate.resolve-other-human-threads` is `always`.           |

## `checks`

### `checks.ignore` — default `[]`

Case-insensitive globs over Shepherd's normalized check name. That name is `CheckRun.name` or `StatusContext.context`, not the workflow display name.

Ignored checks do not affect:

- readiness;
- detailed check summaries;
- triage;
- stall detection.

Their names stay in the `ignoredNames` JSON field and in the `**ignored**` text rollup.

```yaml
checks:
  ignore:
    - "Kilo Code Review"
    - "Preview Deploy *"
```

For a GitHub Actions run, a `checks.never-ignore` match on its workflow name or its raw check name takes precedence. This keeps a protected workflow's child jobs visible.

### `checks.never-ignore` — default `[]`

Matching Actions runs stay visible, and can block readiness, even when a raw job name matches `checks.ignore`. Use it for workflows whose sibling jobs should keep running after one fails. Shepherd never cancels or recommends cancelling workflow runs, because GitHub exposes no exact viewer capability for it.

```yaml
checks:
  never-ignore:
    - "Final Code Review"
```

### `checks.ci-trigger-events` — default `["pull_request", "pull_request_target"]`

Only check runs triggered by these events count toward PR-head CI readiness. Runs from other events, such as `push`, `schedule`, `workflow_dispatch`, or `merge_group`, are `filtered` on that commit.

Merge-queue commits are a separate source. Their `merge_group` checks are included automatically while the PR is queued and after an ejection.

Repositories that never use `pull_request_target` can remove it to reduce noise.

### `checks.ignore-log-lines` — default `[]`

Regex source strings matched against each raw CI log line. Shepherd applies them after it has cleaned and isolated the log:

1. Strip ANSI codes and timestamps.
2. Isolate the first failed step.
3. Drop the run-command group and post-step cleanup.
4. Strip any remaining group markers.

Matching lines are dropped from `## Failing checks` excerpts, so they are also unavailable for check-annotation dedup. Shepherd ships no built-in patterns.

```yaml
checks:
  ignore-log-lines:
    - "^\\[vitest-teardown\\]"
    - "^blob report written to"
    - "^Duration\\s+[\\d.]+m?s\\b"
```

An invalid regex is a validation error (see [Validation](#validation)).

## `iterate`

### `iterate.triage-attempts-per-thread` — default `3`

The number of caller-visible `triage` results that may return the same thread body while it stays unresolved and unchanged. It must be a positive integer.

- Each of those results repeats the pending review commands.
- The next unchanged tick escalates with `triage-thrash`, still carrying those commands.
- Internal polling and debounce ticks do not count, and neither do threads suppressed by seen markers.
- The counter is keyed by the thread transcript hash, so an edit or a reply resets it.

### `iterate.stall-timeout-minutes` — default `60`

How many minutes the loop may repeat without material progress before escalating with `stall-timeout`. `0` disables stall detection.

Progress means a change to any of these, and any change resets the timer:

- the HEAD SHA;
- the failing check names;
- the actionable thread, comment, or review IDs;
- the review-summary minimize bucket.

The same threshold covers CI that never starts. That means relevant queued, requested, or waiting check runs, or pending external status contexts, that have no start timestamp and whose latest activity is older than the threshold. Latest activity is `updatedAtUnix` when GitHub exposes it, otherwise `createdAtUnix`.

A `stack` selection whose layers can only wait uses this threshold for its own timer. See [`stall-timeout`](escalations.md#stall-timeout).

`--stall-timeout <duration>` overrides it for one invocation. A bare number is minutes; an `s`, `m`, or `h` suffix sets the unit (`90s`, `1h`); `0` disables stall detection for that run.

### `iterate.ready-delay-minutes` — default `0`

After the PR first reaches a clean READY state (checks green, no Shepherd-visible work, no blocking bot review pending), Shepherd keeps looping for this many minutes before cancelling, or before merging with `--merge`. The delay gives reviewers and blocking bots time to act.

- The countdown restarts if the PR leaves that state or its head changes.
- A newly surfaced hidden PR comment does not reset it.
- `0` cancels or merges on the first READY tick without a countdown.
- `--ready-delay` overrides the key for one invocation.

For the lifecycle, see [iterate-flow.md](iterate-flow.md#2-ready-delay).

<a id="iterateminimizeapprovals"></a>

### `iterate.minimize-approvals` — default `false`

Also minimize `APPROVED` reviews, with or without a body. It is off by default so approvals stay visible. Turn it on for long-running PRs where stale approvals pile up. `iterate.minimize-comments` still decides which approval authors qualify.

| Setting           | Behavior                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `false` (default) | Approvals render under `## Approvals (surfaced — not minimized)`, but only when iterate is already emitting output for other work; approvals alone do not turn `wait` into that section. They never enter `--minimize-comment-ids`. `fetchPrBatch` reads only the first 50 approved reviews.                                 |
| `true`            | All approvals are fetched. An approval that cannot be minimized gets a one-time `TRIAGE` visibility tick, stays out of `--minimize-comment-ids`, and is gated by seen markers afterward. An approval cannot be minimized when policy excludes it, when there is no GraphQL capability, or under REST, which cannot minimize. |

Non-human `COMMENTED` review summaries are minimized independently of this key. Their IDs appear under `## Review IDs to minimize queue` and are applied through the `apply` command or the MCP `apply` tool. Human summaries are surfaced through seen markers and are never minimized.

<a id="iterateminimizecomments"></a>

### `iterate.minimize-comments` — default `"bots"`

Decides which non-human authors' items go into `--minimize-comment-ids`. Those items are:

- PR comments that can be minimized;
- `COMMENTED` review summaries;
- approvals, when `iterate.minimize-approvals` is on.

A human is an `authorType: User` whose login does not contain `[bot]`. Humans are never minimized.

| Value              | Minimizes                        |
| ------------------ | -------------------------------- |
| `"all"`            | `Bot` and `Unknown` authors      |
| `"bots"` (default) | GitHub `Bot` authors only        |
| `"none"`           | Nothing; items are surfaced only |

Excluded items still pass the seen-marker gate. They are surfaced once, suppressed while unchanged, and shown once more as an [edited comment](actions.md#edited-comments) when edited.

### `iterate.behind-base-hint` — default `""`

A one-liner added to the `triage` instructions when the branch is behind its base (`mergeStatus: "BEHIND"`) or conflicts with it (`"CONFLICTS"`), such as `"rebase --force-with-lease"` or `"see .agents/skills/agent-workflow/git-and-prs.md"`. The conflict hint follows the merge-conflicts step and is omitted on a conflicting native stack layer.

Shepherd never picks the git mechanics; it only echoes this pointer. An empty value omits the hint.

<a id="iteratereviewoutputmaxchars"></a>

### `iterate.review-output-max-chars` — default `50000`

Per-tick budget, in characters, for the review-item bodies a `triage` result shows: changes-requested reviews first, then active threads and PR comments, first-look items, review summaries, and edited comments, oldest first within each group. Shepherd shows items until the next one would exceed the budget, always at least one. Held items are left out of the output, the generated IDs, and the seen markers, so the next run shows them; the result carries a `**showing** N of M review items` line (JSON `triage.reviewItems`) and a rerun step. `0` disables the cap. See [Review output budget](actions.md#review-output-budget).

<a id="iterateresolveotherhumanthreads"></a>

### `iterate.resolve-other-human-threads` — default `"none"`

Decides when Shepherd resolves **other humans'** inline threads after replying. Those are threads by `User` authors who are not in `bot-usernames`.

Threads by bots or other non-human authors, and threads the viewer wrote, always get a reply and are resolved, even after GitHub clears the source line.

| Value              | Other-human thread without a marker         | Other-human thread already ended by a marker |
| ------------------ | ------------------------------------------- | -------------------------------------------- |
| `"none"` (default) | Reply only                                  | Already acknowledged; no mutation            |
| `"outdated"`       | Reply; also resolve when `isOutdated: true` | Retry the resolve only, when outdated        |
| `"always"`         | Reply and resolve                           | Retry the resolve only                       |

### `iterate.instructions` — default `"inline"`

`inline` prints the `triage` commit/push step on every tick. `playbook` points at the shipped "Triage loop" playbook instead. `--instructions` and the MCP `instructions` input override it. Inline is the default because folding the step into a playbook is not a net token win.

## `events`

Opt-in event-driven waiting for the polling CLI. With the default `source: none`, every wait sleeps `poll.interval-seconds`. See [hook-harness.md](hook-harness.md) for setup, health, and limits.

| Key                         | Constraint                | Notes                                                                                                                                                                                                                              |
| --------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`                    | `none`, `hook-harness`    | `hook-harness` reads GitHub webhook events from a hook-harness relay. Shepherd stores no URL or token; they come from the environment or hook-harness's own login file. Startup fails if no login resolves.                        |
| `fallback-interval-seconds` | positive, at most `86400` | While the source is healthy, a quiet wait lasts this long instead of `poll.interval-seconds` (never shorter than that interval). When the source is unhealthy or does not cover the PR's owner, waits use `poll.interval-seconds`. |

Single ticks (`iterate`, MCP, library, `CLAUDE_CODE_REMOTE=true`) never wait, so they ignore `events`.

## `poll`

Defaults for the polling CLI (`pr-shepherd [PR]`). Explicit flags win over these keys.

Single ticks do not poll and ignore these settings. They are `iterate`, `stack --once`, MCP and library calls, and every command when `CLAUDE_CODE_REMOTE=true` ([cloud.md](cloud.md)).

| Key                     | Constraint    | Notes                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interval-seconds`      | positive      | A single PR, including with `--until-terminal`, sleeps this long, or for `--interval` when that is set.                                                                                                                                                                                                        |
| `stack-interval-factor` | ≥ 1           | A stack or multi-PR poll without `--interval` sleeps `interval-seconds × stack-interval-factor`, not rounded. The product must be at most `2147483.647` seconds.                                                                                                                                               |
| `timeout-seconds`       | positive      | `--until-terminal` ignores it, as it ignores `--timeout`.                                                                                                                                                                                                                                                      |
| `debounce-seconds`      | non-negative  | `0` disables the settle window after `TRIAGE`.                                                                                                                                                                                                                                                                 |
| `quiet-status`          | boolean       | `false` keeps the status line on every `WAIT` tick. `--quiet-status` / `--no-quiet-status` override it for one run.                                                                                                                                                                                            |
| `reconcile-seconds`     | non-negative  | GraphQL transport only. An idle `WAIT` tick, with no check running, replays the stored report when every conditional REST change detector answers 304 and the last GraphQL snapshot is younger than this. `0` disables the detectors. See [idle-wait change detectors](graphql.md#idle-wait-change-detectors). |
| `quota-warnings`        | list of bands | See [`poll.quota-warnings`](#pollquota-warnings).                                                                                                                                                                                                                                                              |

### `poll.quota-warnings`

Warning bands for low quota. Each entry has these keys:

- `remaining-percent`: an integer from 1 to 100, unique within the list.
- `interval-factor`: a number ≥ 1, multiplied by the configured `poll.interval-seconds`. It is never multiplied by `--interval` or by the stack factor.
- `interval-minutes`: a positive absolute minimum interval.

An entry needs `interval-factor`, `interval-minutes`, or both. With both, the slower interval wins.

The resolved interval must not decrease as remaining quota falls. `[]` disables the warnings.

The defaults are 30% → 2x, 20% → 5x, and 10% → 10x. At `interval-seconds: 60` the minimum intervals are 2, 5, and 10 minutes.

```yaml
poll:
  quota-warnings:
    - remaining-percent: 25
      interval-minutes: 5
    - remaining-percent: 10
      interval-factor: 10
      interval-minutes: 15
```

How it behaves:

- Shepherd reads the authoritative GraphQL and REST core response headers. It makes no extra rate-limit request.
- When a band is crossed, the next result the agent sees that is not terminal carries the raw quota state and continuation guidance.
  - Bounded CLI guidance uses a timeout twice the recommended interval.
  - MCP and single-tick callers are told how long to wait.
- The poll dispatcher (`pr-shepherd [PR]`, `--until-terminal`, and aggregate `stack` / multi-PR polls) sleeps the slower of the effective interval and the resolved band interval on every normal wait, even after the one-time warning.
  - The effective interval is `--interval` when set. Otherwise it is `poll.interval-seconds` for one PR, or `poll.interval-seconds × poll.stack-interval-factor` for a stack or multi-PR poll.
  - The active band is the crossed entry with the lowest `remaining-percent`.
  - A slower explicit interval is kept, in both the sleep and the instructions.
  - With built-in defaults, a stack sleeps 120s until a band is slower.
- A debounce wait after `TRIAGE`, or a stack `SHEPHERD` debounce wait, uses the remaining debounce window and is not adjusted for bands.
- Each band warns once per worktree and per quota window.
  - A new window starts when GitHub's used count falls, the remaining count rises, or the reset timestamp advances after the prior deadline has passed. An earlier adjustment to the reset time does not re-arm the warning.
  - If the first response is already below several bands, only the lowest one warns. The higher ones are recorded as crossed.
- Single-tick `iterate` and MCP `iterate` never sleep. Callers own the recurrence.

On rate limits:

- `--until-terminal` keeps polling through an exhausted primary limit until the reset time plus a short margin. It honors an explicit `Retry-After` in full, and exits 75 only after repeated attempts that do not move the reset time.
- A bounded poll exits 75 on the first rate-limit error.

See [github-api.md](github-api.md#quota-warnings-and-cadence).

## `apply`

These keys control the push-safety polling used when `requireSha` is passed to an MCP `apply` `review_mutations` operation, or `--require-sha` to the CLI `apply review` command.

### `apply.sha-poll-interval-seconds` — default `2`

Seconds between attempts. It must be positive; fractions such as `0.5` are allowed.

### `apply.sha-poll-max-attempts` — default `10`

The number of attempts before Shepherd gives up and throws. At the default interval this is about 18 seconds.

## `mark-ready`

### `mark-ready.auto` — default `true`

When `true`, Shepherd converts a draft PR to ready for review once all of these hold:

- checks pass;
- no Shepherd-visible work remains;
- no configured blocking review is in progress;
- the ready-delay has not elapsed. After it elapses, the loop emits `cancel`.

When disabled, a clean draft remains in draft and ends its one-PR session with `CANCEL` (`auto-mark-ready-disabled`, exit 0), without a ready-delay countdown or stall guard. Pending CI, bot review, and other actionable work still runs first. A `stack` command continues independent work and eligible ready-prefix merges, then returns `CANCEL` when only clean disabled drafts remain; it never asks the agent to promote them. See [actions.md](actions.md).

### `mark-ready.blocking-reviewer-logins` — default `[]`

Case-insensitive reviewer login prefixes, matched with `startsWith`. While a matching reviewer has a pending review request or a `PENDING` review, Shepherd treats the PR as `BLOCKED` and does not mark it ready.

Nothing blocks by default. List review bots whose reviews must finish first, such as `copilot`, `sonar`, `codeclimate`, or `reviewdog`.

## `merge`

`merge.method` is the preferred merge method.

`merge.command-args` is appended only to the ordinary auto or direct `gh pr merge` commands that `--merge` emits. Queue commands omit every configured option, because the queue controls the method and rejects branch deletion.

`merge.command-args` rejects these options:

- the PR selector and `--repo`/`-R`;
- `--auto`/`--disable-auto` and `--match-head-commit`;
- `--admin`;
- `--help`/`-h`;
- `--body-file`/`-F`, including values attached to the short option.

Select at most one of `--merge`/`-m`, `--squash`/`-s`, or `--rebase`/`-r`. Shepherd also recognizes boolean assignments such as `--squash=true`, and safe short bundles such as `-sd`. If `merge.method` is also set, both must name the same method.

When neither is set, Shepherd picks a method in this order:

| Command | Preference order      |
| ------- | --------------------- |
| One PR  | merge, squash, rebase |
| Stack   | squash, merge, rebase |

- Only methods the repository allows are suggested for a direct request.
- When the repository enables no method, a command that needs one reports that constraint (`merge-method-unavailable`).
- REST queue requests do not validate the unused direct method, including for a native-stack prefix.

There is no key to opt out of stack detection. When GitHub reports that the PR is in a native stack:

- A ready singular `--merge` poll returns `TRIAGE`, which is not terminal, pointing at `pr-shepherd stack <PR URL> --until-terminal --merge`. `merge.command-args` is never consulted for that PR.
- `stack --merge` returns `MERGE` for the highest ready prefix, then `CANCEL` once every layer has merged.

For stack routing (`SHEPHERD`, `WAIT`, `MERGE`, `CANCEL`, `ESCALATE`), see [actions.md](actions.md), [merge-status.md](merge-status.md#merge-requirements), and [`native-stack-merge-routing`](escalations.md#native-stack-merge-routing).

## `classify.standard` — default `{}`

Bundled [classification rules](actions.md#classification-rules) for vendor bot noise.

- They run after the local rules in `.pr-shepherd/classification/`.
- They ship with the package and update when you upgrade.
- Nothing is enabled by default.

```yaml
classify:
  standard:
    all: true # enable every bundled rule
    codecov-report: false # a named entry overrides `all`
```

The value is a map, so it deep-merges across files. An unknown rule name or a non-boolean value is a validation error. Each match reports the rule name `standard:<rule>`.

| Rule                 | Matches                                                                                                                                                                                                                                                                                                                                                                                                                           | Action            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `coderabbit-notices` | CodeRabbit conversation comments that contain only one notice: rate limit, review limit, draft skipped, review skipped (any reason), too many files, or review in progress (including its finishing-touch and Autofix/Autopilot checkbox UI and a metadata-only `Review info` block). Also a status-only reply to a `@coderabbitai` command, a zero-findings completion marker, a skipped-autofix status, or a failed-edit error. | suppress, resolve |
| `codecov-report`     | Codecov coverage report and first-run welcome conversation comments. Coverage gates still report through their status checks.                                                                                                                                                                                                                                                                                                     | suppress, resolve |
| `codex-notices`      | Codex usage-limit notices, the review-activity table (plain or collapsed under `<details>`, whatever its status), and the no-findings code or security review conversation comments, with any `codex-*` metadata markers and a known sign-off                                                                                                                                                                                     | suppress, resolve |
| `dependabot-notices` | Dependabot's "already up-to-date", "updatable in another way", "Superseded by", "won't notify you again", group-rule, and "edited by someone other than Dependabot" replies                                                                                                                                                                                                                                                       | suppress, resolve |
| `gemini-notices`     | Complete Gemini Code Assist daily-quota, review-limit, and unsupported-file-type notices, with or without a GitHub alert prefix                                                                                                                                                                                                                                                                                                   | suppress, resolve |
| `kilo-no-issues`     | A complete Kilo Code no-issues status or report (overview, file list, and usage footer, with no other sections), and its out-of-credits notice                                                                                                                                                                                                                                                                                    | suppress, resolve |
| `socket-reports`     | Socket "Review the following changes in direct dependencies" overview comments (score table and report link, nothing else); any alert, warning, or blocking wording keeps the comment visible                                                                                                                                                                                                                                     |
| `sourcery-notices`   | Complete Sourcery private-repo upsell and weekly rate-limit notices in the observed formats                                                                                                                                                                                                                                                                                                                                       | suppress, resolve |

- Every rule requires GitHub to report the author as a bot. Each rule matches both the GraphQL login (`coderabbitai`) and the REST login (`coderabbitai[bot]`).
- Rules match conversation comments only. The same text on a review summary or an inline review comment follows the normal review path.
- "Resolve" means `autoResolve: true`. With [`actions.auto-minimize-suppressed`](#actionsauto-minimize-suppressed--default-true) on, the comment is also minimized on GitHub.
- A CodeRabbit progress comment may later be edited into a walkthrough.
  - Shepherd reclassifies the current body on every fetch, so the edited walkthrough no longer matches `coderabbit-notices`.
  - The agent sees it once as an [edited comment](actions.md#edited-comments) when readiness work is next reported.
  - It never blocks readiness and stays minimized on GitHub.

## `actions`

Whether `iterate` performs each class of mutation itself. Some have `--no-auto-*` CLI flags that override them for one invocation.

### `actions.auto-minimize-suppressed` — default `true`

This applies only to classification-rule matches that set both `suppress: true` and `autoResolve: true`. These always go through the generated `apply review` command instead:

- the ordinary `iterate.minimize-comments` queues;
- `autoResolve` rules without `suppress`.

When `true`, Shepherd attempts the supported resolve and minimize mutations. It removes the IDs that succeed from the queues the agent sees before deciding whether to emit `triage`.

- GraphQL mutations fail closed unless the capability is explicitly true. REST omits capabilities, so mutations that are otherwise eligible are attempted and GitHub decides.
- Each confirmed success is:
  - copied to `threads.autoResolved` or `comments.autoMinimized`, with the rule's `reason` if it sets one;
  - printed in `## Classification auto-resolve` / `ruleAutoResolve`. See [actions.md](actions.md).
- These automatic mutations do not edit the PR body. Journal entries are optional and require an explicit `apply journal` call.
- Failures stay in `ruleAutoResolveIds`, `comments.minimizeIds`, or `ruleAutoResolveReviewSummaryIds` where retry is supported. They are listed in the same section.
- Denied review operations are surfaced once and skipped. REST cannot minimize, so minimization under REST is surfaced as a one-look skip.

When `false`, Shepherd does not mutate or print the line. Supported IDs stay on the generated `apply review` command. Minimization under REST is still a one-look skip, without an unusable command.

### `actions.work-while-queued` — default `false`

When `false`, `iterate --merge` defers non-CI work while the PR is in the merge queue, because a push would eject it. Deferred work is review threads, PR comments, `CHANGES_REQUESTED` reviews, and review summaries. The tick is `WAIT`, carrying raw counts of the held work (see [`wait`](actions.md#wait)). Failing checks, unseen check-run annotations, and merge conflicts are never deferred and always route to `triage`.

Set it to `true` to handle deferred work immediately, even while the PR is queued.

## User-level GitHub App settings

`$PR_SHEPHERD_HOME/github-apps.yml` (default `~/.pr-shepherd/github-apps.yml`) lists GitHub Apps whose installation tokens answer identity-independent reads for matching repositories; writes and viewer-relative reads stay on your token. It is separate from `.pr-shepherdrc.yml`, is never read from a repository, and follows the same rules: kebab-case keys, and unknown keys or invalid values exit `78`. Setup and the key reference are in [github-app.md](github-app.md).

## Environment variables

| Variable                                                     | Effect                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PR_SHEPHERD_STATE_DIR`                                      | Override the base directory for loop state (defaults below).                                                                                                                                                |
| `PR_SHEPHERD_HOME`                                           | User-level folder for `github-apps.yml` (defaults to `~/.pr-shepherd`). See [github-app.md](github-app.md). It is read only from here, never from `.pr-shepherdrc.yml`.                                     |
| `PR_SHEPHERD_POLL_GUARD`                                     | Plugin poll guard level: `advisory` (default), `fail`, or `disabled` ([skills.md](skills.md#poll-guard)).                                                                                                   |
| `PR_SHEPHERD_LOG_DISABLED`                                   | `1` disables the per-worktree debug log.                                                                                                                                                                    |
| `CI`                                                         | Any value other than empty, `0`, or `false` also disables the debug log.                                                                                                                                    |
| `PR_SHEPHERD_LOG_MAX_BODY`                                   | Maximum characters of each logged HTTP body (default `262144`). Larger bodies are truncated.                                                                                                                |
| `GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_PERSONAL_ACCESS_TOKEN` | The GitHub token. Shepherd tries, in order: `GH_TOKEN`, `GITHUB_TOKEN`, `gh auth token` (needs the `gh` CLI), then `GITHUB_PERSONAL_ACCESS_TOKEN`. Required access: [authentication.md](authentication.md). |
| `CLAUDE_CODE_REMOTE`                                         | `true` does three things: `github.transport: auto` starts with REST, the default command and `stack` run one tick instead of polling, and state defaults to durable storage.                                |
| `HTTPS_PROXY` / `HTTP_PROXY` (or lowercase)                  | Route GitHub requests through a proxy, for both transports. Lowercase takes precedence.                                                                                                                     |
| `NO_PROXY` (or lowercase)                                    | Hosts that bypass the proxy. Lowercase takes precedence.                                                                                                                                                    |

When `PR_SHEPHERD_STATE_DIR` is unset, the default state directory is:

| Context                   | Default                                                                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_CODE_REMOTE=true` | `<git-common-dir>/pr-shepherd-state` ([durable state](cloud.md#durable-state))                                                                                                                                        |
| macOS                     | `pr-shepherd-state` in the per-user temp dir (`getconf DARWIN_USER_TEMP_DIR`), not `$TMPDIR`, so sandboxed and unsandboxed runs share state                                                                           |
| Linux                     | `/tmp/pr-shepherd-state-<uid>` (created with mode `0700`), when it is a real directory you own that is not group- or world-writable and is readable, writable, and searchable. Otherwise `$TMPDIR/pr-shepherd-state`. |
| Other platforms           | `os.tmpdir()`                                                                                                                                                                                                         |

Per-repository files live at `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/`. Separate owner and repository directories keep hyphenated names from colliding.

Directories named `<owner>-<repo>` from older builds are no longer read, so the first run after upgrading starts clean: seen comments can surface once more, and the ready-delay restarts. `pr-shepherd admin clean all` removes the whole base directory.
