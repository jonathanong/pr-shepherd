# pr-shepherd configuration

[← README](../README.md)

Every `.pr-shepherdrc.yml` key and environment variable Shepherd reads, with defaults and effects. For repository owners and anyone tuning how Shepherd gathers context and which actions `iterate` may take automatically.

## How files load

The CLI and MCP server read the same files:

1. Every `.pr-shepherdrc.yml` from the current working directory up toward `$HOME`.
2. `$HOME/.pr-shepherdrc.yml`, always, as the farthest user-level overlay — even when cwd is outside `$HOME`. In that case the walk covers cwd's ancestors but stops before the filesystem root, so `/.pr-shepherdrc.yml` cannot override the user file.

Files deep-merge ESLint-style: closer files override farther ones, nested objects merge, and arrays replace. Every field is optional; built-in defaults fill the rest.

```yaml
# ~/.pr-shepherdrc.yml
ignoreChecks:
  - "Kilo*"
iterate:
  stallTimeoutMinutes: 90

# <repo>/.pr-shepherdrc.yml
iterate:
  fixAttemptsPerThread: 5
```

From the repo, the result keeps `ignoreChecks` and `stallTimeoutMinutes` from `$HOME` and takes `fixAttemptsPerThread: 5` from the project file. If both files set `ignoreChecks`, the closer list replaces the farther one.

Validation:

- An unknown key, or an unknown key under a known group, prints a stderr warning and is ignored.
- A file that fails to parse as YAML prints a stderr warning and is skipped; the other files still apply.
- Any other invalid value (wrong type, bad regex, out-of-range number, …) prints a stderr warning, and the **whole merged config** falls back to built-in defaults. Exception: a malformed `classify.standard` map or entry warns and is ignored on its own.
- Deprecated `actions.autoResolveOutdated` and `actions.commitSuggestions` are accepted, warned about, and ignored.

## Example

```yaml
cliCommand:
  - pnpm
  - exec
  - pr-shepherd

botUsernames:
  - chatgpt-connector
  - claude
  - coderabbitai

ignoreChecks:
  - "Kilo Code Review"
  - "Kilo*"

iterate:
  fixAttemptsPerThread: 5 # raise before escalating to manual review
  stallTimeoutMinutes: 60 # escalate if state unchanged or CI has not started for this many minutes
  minimizeApprovals: false # set true to also minimize APPROVED-state reviews
  minimizeComments: all # all | bots | none
  behindBaseHint: "rebase --force-with-lease" # one-liner shown on fix_code when behind or conflicting with base
  resolveOtherHumanThreads: none # none | outdated | always
  instructions: inline # inline | playbook

poll:
  intervalSeconds: 120 # single-PR delay between WAIT ticks
  stackIntervalFactor: 2 # stack and multi-PR polls sleep intervalSeconds times this
  timeoutSeconds: 270 # default bounded WAIT timeout; ignored by --until-terminal
  debounceSeconds: 60 # settle window after first FIX_CODE; 0 disables
  quietStatus: false # unchanged WAIT snapshots remain visible by default
  reconcileSeconds: 900 # max age of a GraphQL snapshot replayed on idle waits; 0 disables

watch:
  readyDelayMinutes: 10 # settle window after PR first becomes READY
  graphqlQuotaWarnings:
    - remainingPercent: 30
      pollIntervalFactor: 2
    - remainingPercent: 20
      pollIntervalFactor: 5
    - remainingPercent: 10
      pollIntervalFactor: 10

resolve:
  shaPoll:
    intervalMs: 2000
    maxAttempts: 10

checks:
  ciTriggerEvents:
    - pull_request
    - pull_request_target

mergeStatus:
  blockingReviewerLogins:
    - copilot
    - sonar # add other review bots here

merge:
  method: squash
  commandArgs:
    - --delete-branch

actions:
  autoMinimizeSuppressed: true
  autoMarkReady: true
  neverCancelRuns:
    - "Final Code Review"
  workWhileQueued: false # set true to act on non-CI work immediately instead of waiting until the PR leaves the merge queue
```

## All supported keys

Built-in defaults live in `src/config.json`.

| Key                                  | Default                                   | Purpose                                                                                                                                                 |
| ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github.transport`                   | `"auto"`                                  | `auto`, `graphql`, or `rest`. See [GitHub API transport](#github-api-transport).                                                                        |
| `cliCommand`                         | `["pr-shepherd"]`                         | Argv prefix for every `pr-shepherd` command Shepherd emits.                                                                                             |
| `botUsernames`                       | Known code-review bot logins              | Logins treated as bots even when GitHub reports `User` or `Unknown`.                                                                                    |
| `ignoreChecks`                       | `[]`                                      | Case-insensitive globs excluded from CI decisions; names stay in the ignored rollup.                                                                    |
| `iterate.fixAttemptsPerThread`       | `3`                                       | Caller-visible `FIX_CODE` deliveries of one unchanged unresolved thread before the next tick escalates.                                                 |
| `iterate.stallTimeoutMinutes`        | `60`                                      | Minutes without progress, or of unstarted CI, before `escalate` / `stall-timeout`; `0` disables.                                                        |
| `iterate.minimizeApprovals`          | `false`                                   | Also minimize `APPROVED` reviews (and paginate past 50 approvals).                                                                                      |
| `iterate.minimizeComments`           | `"all"`                                   | Non-human author classes to minimize: `all`, `bots`, or `none`. Humans are never minimized.                                                             |
| `iterate.behindBaseHint`             | `""`                                      | One-liner on `fix_code` when the branch is behind or conflicts with its base; empty omits it.                                                           |
| `iterate.resolveOtherHumanThreads`   | `"none"`                                  | When to resolve other-human threads after a reply: `none`, `outdated`, or `always`.                                                                     |
| `iterate.instructions`               | `"inline"`                                | `inline` or `playbook` for the `fix_code` commit/push instructions. Overridden by `--instructions` and the MCP `instructions` input.                    |
| `poll.mode`                          | `"auto"`                                  | `auto`, `poll`, or `event`. Overridden by `--poll-mode` and the MCP/library `pollMode` option.                                                          |
| `poll.intervalSeconds`               | `60`                                      | Delay between `WAIT` ticks for one PR; overridden by `--interval`.                                                                                      |
| `poll.stackIntervalFactor`           | `2`                                       | Multiplier for `--stack` and multi-PR sleeps; `--interval` overrides it and is not multiplied.                                                          |
| `poll.timeoutSeconds`                | `270`                                     | Wall-clock cap for bounded `WAIT` polling; overridden by `--timeout`, ignored by `--until-terminal`.                                                    |
| `poll.debounceSeconds`               | `60`                                      | Settle window after the first `FIX_CODE`; overridden by `--debounce`; `0` disables.                                                                     |
| `poll.quietStatus`                   | `false`                                   | Hide unchanged `WAIT` snapshots; overridden by `--quiet-status` / `--no-quiet-status`.                                                                  |
| `poll.reconcileSeconds`              | `900`                                     | GraphQL transport: max age of a snapshot an idle `WAIT` tick may replay when REST change detectors are unchanged; `0` disables.                         |
| `watch.readyDelayMinutes`            | `10`                                      | Settle window after READY before the loop cancels or merges.                                                                                            |
| `watch.graphqlQuotaWarnings`         | `30% → 2x, 20% → 5x, 10% → 10x`           | GraphQL and REST core quota warning bands and minimum poll intervals; `[]` disables.                                                                    |
| `resolve.shaPoll.intervalMs`         | `2000`                                    | Poll interval while waiting for `--require-sha` to land on GitHub.                                                                                      |
| `resolve.shaPoll.maxAttempts`        | `10`                                      | Max `--require-sha` polls before giving up.                                                                                                             |
| `checks.ciTriggerEvents`             | `["pull_request", "pull_request_target"]` | Workflow `on:` events treated as PR-head CI; queue `merge_group` checks are included automatically.                                                     |
| `checks.ignoreLogLines`              | `[]`                                      | Regexes; matching raw CI log lines are dropped from `## Failing checks` excerpts and annotation dedup.                                                  |
| `classify.standard`                  | `{}`                                      | Opt-in bundled classification rules for common bot noise.                                                                                               |
| `mergeStatus.blockingReviewerLogins` | `["copilot"]`                             | Reviewer login prefixes whose pending review or request blocks `mark_ready`.                                                                            |
| `merge.method`                       | unset                                     | Preferred method: `merge`, `squash`, or `rebase`, used only when the repository allows it. A strategy flag in `commandArgs` must name the same.         |
| `merge.commandArgs`                  | `[]`                                      | Extra options for ordinary `gh pr merge` commands; not used for queue commands. Its strategy flag is the preferred method when `merge.method` is unset. |
| `actions.autoMinimizeSuppressed`     | `true`                                    | Resolve/minimize classification matches with both flags, then print and report the mutation result.                                                     |
| `actions.autoMarkReady`              | `true`                                    | Emit `mark_ready` when a draft PR reaches a clean ready state.                                                                                          |
| `actions.neverCancelRuns`            | `[]`                                      | Legacy name; matching checks stay visible despite `ignoreChecks`. Shepherd never cancels runs.                                                          |
| `actions.workWhileQueued`            | `false`                                   | Act on non-CI work immediately while the PR is in the merge queue instead of deferring it.                                                              |

## GitHub API transport

Set `github.transport`, pass `--transport auto|graphql|rest` to the CLI, or pass the equivalent library/MCP option.

| Mode      | Behavior                                                                                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto`    | REST when `CLAUDE_CODE_REMOTE=true`; otherwise GraphQL, switching to REST for the rest of the process only on the recognized Claude Code 403, exhausted primary GraphQL budget, or an outage that persists after bounded retries. |
| `graphql` | GraphQL only.                                                                                                                                                                                                                     |
| `rest`    | REST only.                                                                                                                                                                                                                        |

Credential failures, ordinary permission or query errors, and secondary throttling never switch transports. Proxy configuration is honored for both.

REST can return less context than GraphQL; missing fields stay unknown. A clean merge state with complete CI and complete feedback evidence can be READY without `reviewDecision` or branch-protection data. `reviewDecision` is never a readiness input, so its absence does not block a non-clean state (for example `BLOCKED` awaiting an approval, `UNSTABLE`, or `HAS_HOOKS`) either; unreadable branch protection or rulesets still prevent READY for a non-clean state. Cloud credentials: [authentication.md](authentication.md). Transport limits and usage: [github-api.md](github-api.md).

## `cliCommand` — default `["pr-shepherd"]`

Argv prefix for every `pr-shepherd` command Shepherd emits — follow-up `--stack` and per-PR session commands, `apply review` and `apply journal` mutations, and commit-suggestion commands — in Markdown, JSON, and MCP output. The default assumes `pr-shepherd` is on `PATH`. A repository that pins pr-shepherd as a dependency should set its launcher so agents run the pinned version:

```yaml
cliCommand:
  - pnpm
  - exec
  - pr-shepherd
```

The value must be a non-empty list of non-empty strings. Shepherd shell-quotes each argument when it renders command text.

## `botUsernames`

Logins Shepherd treats as bot authors, in addition to GitHub-detected bots (`authorType: Bot`) and logins containing `[bot]`. Matching is case-insensitive, and a trailing `[bot]` is equivalent to the bare login. The default lists common code-review bots (see `src/config.json`).

| Thread author                | Returned each tick?                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Bot (detected or configured) | Yes, until resolved, even when unchanged and already seen. Comments and reviews follow bot minimize policy. |
| Viewer-authored human        | Yes, until resolved.                                                                                        |
| Other human                  | Marker-gated: shown again only when changed, unless `iterate.resolveOtherHumanThreads` is `always`.         |

## `ignoreChecks`

Case-insensitive globs over Shepherd's normalized check name (`CheckRun.name` or `StatusContext.context`, not the workflow display name). Ignored checks do not affect readiness, detailed check summaries, triage, or stall detection. Their names stay in the `ignoredNames` JSON field and the `**ignored**` text rollup.

```yaml
ignoreChecks:
  - "Kilo Code Review"
  - "Preview Deploy *"
```

For a GitHub Actions run, an `actions.neverCancelRuns` match on its workflow name or raw check name takes precedence, keeping a protected workflow's child jobs visible.

## `iterate`

### `iterate.fixAttemptsPerThread` — default `3`

How many caller-visible `fix_code` results may return the same thread body while it stays unresolved and unchanged. Each repeats the pending review commands; the next unchanged tick escalates with `fix-thrash` and keeps those commands. Internal polling/debounce ticks and threads suppressed by seen markers do not count. The counter is keyed by the thread transcript hash, so an edit or reply resets it.

Raise it for threads that need several fix-push-review cycles; lower it to escalate sooner.

### `iterate.stallTimeoutMinutes` — default `60`

Minutes the loop may repeat without material progress before escalating with `stall-timeout`. Progress means a change to the HEAD SHA, the failing check names, actionable thread/comment/review IDs, or the review-summary minimize bucket; any change resets the timer.

The same threshold covers CI that never starts: relevant queued/requested/waiting check runs, or pending external status contexts, with no start timestamp whose latest activity (`updatedAtUnix` when GitHub exposes it, else `createdAtUnix`) is older than the threshold. A `--stack` selection whose layers can only wait uses it for its own timer; see [`stall-timeout`](escalations.md#stall-timeout).

Override per invocation with `--stall-timeout <duration>`: a bare number is minutes, or use an `s`/`m`/`h` suffix (`--stall-timeout 90s`, `--stall-timeout 1h`). `--stall-timeout 0` disables stall detection.

<a id="iterateminimizeapprovals"></a>

### `iterate.minimizeApprovals` — default `false`

Also minimize `APPROVED` reviews (`pr approve` clicks, with or without a body). Off by default because approvals are a signal you usually want visible; turn it on for long-running PRs where stale approvals pile up. `iterate.minimizeComments` still filters which approval authors qualify.

| Setting           | Behavior                                                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `false` (default) | Approvals render under `## Approvals (surfaced — not minimized)` only when iterate is already emitting output for other work; alone they do not turn `wait` into that section. They never enter `--minimize-comment-ids`. `fetchPrBatch` reads only the first 50 approved reviews. |
| `true`            | All approvals are fetched. One that cannot be minimized (excluded by policy, no GraphQL capability, or REST, which cannot minimize) gets a one-time `FIX_CODE` visibility tick, stays out of `--minimize-comment-ids`, and is marker-gated afterward.                              |

Non-human `COMMENTED` review summaries are minimized independently of this key: their IDs appear under `## Review IDs to minimize queue` and are applied through the `apply` command or MCP `apply` tool. Human summaries are surfaced through seen markers and never minimized.

<a id="iterateminimizecomments"></a>

### `iterate.minimizeComments` — default `"all"`

Which non-human authors' items go to `--minimize-comment-ids`: minimizable PR comments, `COMMENTED` review summaries, and (with `iterate.minimizeApprovals`) approvals. A human is `authorType: User` without `[bot]` in the login and is never minimized.

| Value    | Minimizes                        |
| -------- | -------------------------------- |
| `"all"`  | `Bot` and `Unknown` authors      |
| `"bots"` | GitHub `Bot` authors only        |
| `"none"` | Nothing; items are surfaced only |

The deprecated `"users"` value warns and is treated as `"none"`. Excluded items still pass the seen-marker gate: surfaced once, suppressed while unchanged, re-surfaced when edited.

### `iterate.behindBaseHint` — default `""`

One-liner added to `fix_code` instructions when the branch is behind (`mergeStatus: "BEHIND"`) or conflicts with (`mergeStatus: "CONFLICTS"`) its base — for example `"rebase --force-with-lease"`, `"merge the main branch"`, or `"see .agents/skills/agent-workflow/git-and-prs.md"`. The conflict hint follows the merge-conflicts step and is omitted on a conflicting native stack layer. Shepherd never picks the git mechanics; it only echoes this pointer (see [actions.md](actions.md)). Empty omits the hint.

<a id="iterateresolveotherhumanthreads"></a>

### `iterate.resolveOtherHumanThreads` — default `"none"`

When Shepherd resolves **other-human** inline threads (`User` authors not in `botUsernames`) after replying. Bot/non-human and viewer-authored threads always reply-and-resolve, even after GitHub clears the source line.

| Value              | Unmarked other-human thread                 | Marker-ended other-human thread   |
| ------------------ | ------------------------------------------- | --------------------------------- |
| `"none"` (default) | Reply only                                  | Already acknowledged; no mutation |
| `"outdated"`       | Reply; also resolve when `isOutdated: true` | Resolve-only retry when outdated  |
| `"always"`         | Reply and resolve                           | Resolve-only retry                |

```yaml
iterate:
  resolveOtherHumanThreads: outdated
```

## `poll`

Defaults for the polling CLI (`pr-shepherd [PR]` and `pr-shepherd poll`); explicit flags win. Single-tick `iterate` and MCP calls do not poll, and event mode (`poll.mode`) ignores these settings — see [cloud.md](cloud.md).

```yaml
poll:
  intervalSeconds: 120
  stackIntervalFactor: 2
  timeoutSeconds: 270
  debounceSeconds: 60
  quietStatus: false
  reconcileSeconds: 900
```

| Key                   | Constraint                  | Notes                                                                                                                                                                                                                                                                                              |
| --------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `intervalSeconds`     | positive finite             | One PR, including `--until-terminal`, sleeps this or `--interval`.                                                                                                                                                                                                                                 |
| `stackIntervalFactor` | finite, ≥ 1                 | A stack or multi-PR poll without `--interval` sleeps `intervalSeconds * stackIntervalFactor` (not rounded). `intervalSeconds × factor` in ms must be ≤ 2147483647.                                                                                                                                 |
| `timeoutSeconds`      | positive finite             | `--until-terminal` ignores it, as it ignores `--timeout`.                                                                                                                                                                                                                                          |
| `debounceSeconds`     | non-negative finite         | `0` disables the post-`FIX_CODE` settle window.                                                                                                                                                                                                                                                    |
| `quietStatus`         | boolean                     | `false` keeps the status line on every `WAIT` tick. `--quiet-status` / `--no-quiet-status` override per run.                                                                                                                                                                                       |
| `reconcileSeconds`    | non-negative finite         | GraphQL transport: an idle `WAIT` tick (no check running) replays the stored report when all conditional REST change detectors answer 304 and the last GraphQL snapshot is younger than this. `0` disables the detectors. See [idle-wait change detectors](graphql.md#idle-wait-change-detectors). |
| `mode`                | `auto` \| `poll` \| `event` | `event` runs one tick with no sleeping or debounce and reports `nextCheck`; `auto` picks `event` when `CLAUDE_CODE_REMOTE=true`.                                                                                                                                                                   |

Factor-based quota-warning bands use the configured `intervalSeconds`; neither `--interval` nor the stack factor compounds into them. `pollIntervalMinutes` sets an absolute minimum cadence. The dispatcher sleeps the slower of the effective interval and the active band; with built-in defaults a stack sleeps 120s until a band is slower.

## `watch`

### `watch.readyDelayMinutes` — default `10`

After the PR first reaches a clean READY state (checks green, no Shepherd-visible work, no blocking bot review pending), Shepherd keeps looping this many minutes before cancelling (or merging with `--merge`), giving reviewers and blocking bots time to act. The countdown restarts if the PR leaves that state or its head changes; a newly surfaced hidden PR comment does not reset it. Lifecycle: [iterate-flow.md](iterate-flow.md#2-ready-delay).

### `watch.graphqlQuotaWarnings`

Low-quota warning bands. Each entry maps `remainingPercent` (an integer 1–100, unique per list) to a minimum polling cadence via `pollIntervalFactor` (≥ 1, multiplied by configured `poll.intervalSeconds`, never by `--interval`), `pollIntervalMinutes` (positive), or both (the slower wins). The resolved interval must not decrease as remaining quota falls. `[]` disables warnings.

| Remaining | Default factor | At `intervalSeconds: 60` | At `intervalSeconds: 120` |
| --------- | -------------- | ------------------------ | ------------------------- |
| 30%       | 2x             | 2 min                    | 4 min                     |
| 20%       | 5x             | 5 min                    | 10 min                    |
| 10%       | 10x            | 10 min                   | 20 min                    |

How it behaves:

- Shepherd reads authoritative GraphQL and REST core response headers; it makes no extra rate-limit request.
- When a band is crossed, the next non-terminal agent-visible result carries the raw quota state and continuation guidance. Bounded CLI guidance uses a timeout twice the recommended interval; MCP and single-tick callers are told how long to wait.
- The poll dispatcher (`pr-shepherd [PR]`, `--until-terminal`, aggregate `--stack` / multi-PR) sleeps `max(effective interval, resolved band interval)` on every normal wait, even after the one-shot warning. The effective interval is `--interval` when set, else `poll.intervalSeconds` (one PR) or `poll.intervalSeconds * poll.stackIntervalFactor` (stack or multi-PR). The active band is the crossed entry with the lowest `remainingPercent`. A slower explicit interval is kept in both sleep and instructions.
- A post-`FIX_CODE` or stack `SHEPHERD` debounce wait uses the remaining debounce window and is not band-adjusted.
- Each band warns once per worktree and quota window. A new window starts when GitHub's used count falls, the remaining count rises, or the reset timestamp advances after the prior deadline passed; an earlier reset adjustment does not re-arm. If the first response is already below several bands, only the lowest warns and the higher ones are recorded as crossed.
- Single-tick `iterate` and MCP `iterate` never sleep; callers own recurrence.

On rate limits, `--until-terminal` keeps polling through an exhausted primary limit until the reset plus a short margin, honors an explicit `Retry-After` in full, and exits 75 only after repeated attempts that do not move the reset time. A bounded poll exits 75 on the first rate-limit error. See [github-api.md](github-api.md#quota-warnings-and-cadence).

## `resolve`

### `resolve.shaPoll`

Push-safety polling used when `requireSha` is passed to an MCP `apply` `review_mutations` operation or the CLI `apply review` command.

#### `resolve.shaPoll.maxAttempts` — default `10`

Attempts before giving up and throwing — about 18 seconds at the default interval.

#### `resolve.shaPoll.intervalMs` — default `2000`

Milliseconds between attempts.

## `checks`

### `checks.ciTriggerEvents` — default `["pull_request", "pull_request_target"]`

Only check runs triggered by these events count toward PR-head CI readiness. Runs from `push`, `schedule`, `workflow_dispatch`, `merge_group`, etc. are `filtered` on that commit. Merge-queue commits are a separate source: their `merge_group` checks are included automatically while queued and after an ejection. Repositories that never use `pull_request_target` can remove it to reduce noise.

### `checks.ignoreLogLines` — default `[]`

Regex source strings matched against each raw CI log line after ANSI/timestamp cleanup and first-failed-step isolation (run-command group and post-step cleanup dropped, remaining group markers stripped). Matching lines are dropped from `## Failing checks` excerpts and so are unavailable for check-annotation dedup. Shepherd ships no built-in patterns; noise is specific to each toolchain.

```yaml
checks:
  ignoreLogLines:
    - "^\\[vitest-teardown\\]"
    - "^blob report written to"
    - "^Duration\\s+[\\d.]+m?s\\b"
```

An invalid regex is an invalid value (see [How files load](#how-files-load)).

## `merge`

`merge.method` is the preferred merge method. `merge.commandArgs` is appended only to ordinary auto/direct `gh pr merge` commands emitted by `--merge`; queue commands omit every configured option because the queue controls the method and rejects branch deletion.

`merge.commandArgs` rejects:

- the PR selector and `--repo`/`-R`;
- `--auto`/`--disable-auto` and `--match-head-commit`;
- `--admin`;
- `--help`/`-h`;
- `--body-file`/`-F`, including attached short-option values.

Select at most one of `--merge`/`-m`, `--squash`/`-s`, or `--rebase`/`-r`. Boolean assignments (`--squash=true`) and safe short bundles (`-sd`) are recognized. That flag and `merge.method` must name the same method.

Method selection when neither is set:

| Command | Preference order      |
| ------- | --------------------- |
| One PR  | merge, squash, rebase |
| Stack   | squash, merge, rebase |

Only repository-allowed methods are suggested for a direct request. When the repository enables none, a command that needs one reports that constraint (`merge-method-unavailable`). REST queue requests do not validate the unused direct method, including for a native-stack prefix.

There is no key to opt out of stack detection. When GitHub reports the PR is in a native stack, a ready singular `--merge` poll returns non-terminal `FIX_CODE` pointing at `--stack <PR URL> --until-terminal --merge`, and `merge.commandArgs` is never consulted for that PR. `--stack --merge` returns `MERGE` for the highest ready prefix, then `CANCEL` once every layer merges. Stack routing (`SHEPHERD`, `WAIT`, `MERGE`, `CANCEL`, `ESCALATE`): [actions.md](actions.md), [merge-status.md](merge-status.md#merge-requirements), and [`native-stack-merge-routing`](escalations.md#native-stack-merge-routing).

## `mergeStatus`

### `mergeStatus.blockingReviewerLogins` — default `["copilot"]`

Case-insensitive reviewer login prefixes (matched with `startsWith`). While a matching reviewer has a pending review request or a `PENDING` review, Shepherd treats the PR as `BLOCKED` and does not mark it ready. Add other review bots (e.g. `sonar`, `codeclimate`, `reviewdog`) whose reviews must finish first.

## `classify.standard` — default `{}`

Bundled [classification rules](actions.md#classification-rules) for vendor bot noise. They run after local `.pr-shepherd/classification/` rules, ship with the package, and update when you upgrade. Nothing is enabled by default:

```yaml
classify:
  standard:
    all: true # enable every bundled rule
    codecov-report: false # a named entry overrides `all`
```

The value is a map so it deep-merges across files. Unknown rule names and non-boolean values warn on stderr and are ignored. Each match reports the rule name `standard:<rule>`.

| Rule                 | Matches                                                                                                                                                                                                                                                   | Action            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `coderabbit-notices` | CodeRabbit conversation comments that contain only a rate-limit, review-limit, draft-skipped, review-skipped (any reason), too-many-files, or review-in-progress notice (including the known finishing-touch UI), or a reply to a `@coderabbitai` command | suppress, resolve |
| `codecov-report`     | Codecov coverage report conversation comments (coverage gates still report through their status checks)                                                                                                                                                   | suppress, resolve |
| `codex-notices`      | Codex usage-limit notices, the review-activity table, and the no-findings code or security review conversation comments                                                                                                                                   | suppress, resolve |
| `dependabot-notices` | Dependabot's "already up-to-date" and "updatable in another way" replies                                                                                                                                                                                  | suppress, resolve |
| `gemini-notices`     | Complete Gemini Code Assist daily-quota and review-limit notices in the observed formats                                                                                                                                                                  | suppress, resolve |
| `kilo-no-issues`     | Complete Kilo Code no-issues status or report with only a file list and a matching file count                                                                                                                                                             | suppress, resolve |
| `sourcery-notices`   | Complete Sourcery private-repo upsell and weekly rate-limit notices in the observed formats                                                                                                                                                               | suppress, resolve |

- Every rule requires GitHub to report the author as a bot and matches both GraphQL (`coderabbitai`) and REST (`coderabbitai[bot]`) logins.
- Rules match conversation comments only; the same text on a review summary or inline review comment follows the normal review path.
- `coderabbit-review-summary` and `codex-review-summary` are no longer rule names; setting them warns and is ignored.
- "Resolve" means `autoResolve: true`, so with [`actions.autoMinimizeSuppressed`](#actionsautominimizesuppressed--default-true) the comment is also minimized on GitHub.
- A CodeRabbit progress comment may later be edited into a walkthrough. Shepherd reclassifies the current body on every fetch; an edited walkthrough no longer matches `coderabbit-notices` and appears to the agent as an edited, minimized first-look comment. It stays minimized on GitHub.

## `actions`

Whether `iterate` performs each class of mutation itself. Some have `--no-auto-*` CLI flags for per-invocation overrides.

### `actions.autoMinimizeSuppressed` — default `true`

Applies only to classification-rule matches that set both `suppress: true` and `autoResolve: true`. Ordinary `iterate.minimizeComments` queues and `autoResolve` rules without `suppress` always go through the generated `apply review` command.

When `true`, Shepherd attempts the supported resolve/minimize mutations and removes successful IDs from the agent-facing queues before deciding whether to emit `fix_code`:

- GraphQL mutations are fail-closed unless the capability is explicitly true. REST omits capabilities, so otherwise-eligible mutations are attempted and GitHub decides.
- Each confirmed success is copied to `threads.autoResolved` or `comments.autoMinimized` (with the rule `reason`, if set), and printed in `## Classification auto-resolve` / `ruleAutoResolve`. These automatic mutations do not edit the PR body; journal entries are optional and require an explicit `apply journal` call. See [actions.md](actions.md).
- Failures stay in `ruleAutoResolveIds`, `comments.minimizeIds`, or `ruleAutoResolveReviewSummaryIds` where retry is supported, and are listed in the same section.
- Denied review operations are surfaced once and skipped; REST minimization is unsupported and surfaced as a one-look skip.

When `false`, Shepherd does not mutate or print the line. Supported IDs stay on the generated `apply review` command; unsupported REST minimization is a one-look skip without an unusable command.

### `actions.autoMarkReady` — default `true`

When `true`, Shepherd converts a draft PR to ready for review once checks pass, no Shepherd-visible work remains, no configured blocking review is in progress, and the ready-delay has not elapsed (after it elapses the loop emits `cancel`). When disabled, a clean draft remains in draft and ends its one-PR session with `CANCEL` (`auto-mark-ready-disabled`, exit 0), without a ready-delay countdown or stall guard. Pending CI, bot review, and other actionable work still runs first. A stack selector continues independent work and eligible ready-prefix merges, then returns `CANCEL` when only clean disabled drafts remain; it never asks the agent to promote them. See [actions.md](actions.md).

### `actions.neverCancelRuns` — default `[]`

Legacy, cancellation-named key. Shepherd never cancels or recommends cancelling workflow runs, because GitHub exposes no exact viewer capability for it. Matching Actions runs stay visible — and can block readiness — even when a raw job name matches `ignoreChecks`. Use it for workflows whose sibling jobs should keep running after one fails:

```yaml
actions:
  neverCancelRuns:
    - "Final Code Review"
```

### `actions.workWhileQueued` — default `false`

When `false`, `iterate --merge` defers non-CI work — review threads, PR comments, `CHANGES_REQUESTED` reviews, and review summaries — while the PR is in the merge queue, because a push would eject it. The tick is `WAIT` with raw counts of held work (see [`wait`](actions.md#wait)). Failing checks, unseen check-run annotations, and merge conflicts are never deferred and always route to `fix_code`.

Set `true` to handle that work immediately even while queued:

```yaml
actions:
  workWhileQueued: true
```

## Environment variables

| Variable                                                     | Effect                                                                                                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PR_SHEPHERD_STATE_DIR`                                      | Override the loop-state base directory (defaults below).                                                                                                                           |
| `PR_SHEPHERD_LOG_DISABLED`                                   | `1` disables the per-worktree debug log.                                                                                                                                           |
| `CI`                                                         | Any value other than empty, `0`, or `false` also disables the debug log.                                                                                                           |
| `PR_SHEPHERD_LOG_MAX_BODY`                                   | Max characters of each logged HTTP body (default `262144`); larger bodies are truncated.                                                                                           |
| `GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub token. Order: `GH_TOKEN` → `GITHUB_TOKEN` → `gh auth token` (needs the `gh` CLI) → `GITHUB_PERSONAL_ACCESS_TOKEN`. Required access: [authentication.md](authentication.md). |
| `CLAUDE_CODE_REMOTE`                                         | `true` makes `github.transport: auto` start with REST, `poll.mode: auto` select `event`, and state default to durable storage.                                                     |
| `HTTPS_PROXY` / `HTTP_PROXY` (or lowercase)                  | Route GitHub requests through a proxy, for both transports. Lowercase takes precedence.                                                                                            |
| `NO_PROXY` (or lowercase)                                    | Hosts that bypass the proxy. Lowercase takes precedence.                                                                                                                           |

Default state directory when `PR_SHEPHERD_STATE_DIR` is unset:

| Context                                          | Default                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLAUDE_CODE_REMOTE=true`, or an event-mode tick | `<git-common-dir>/pr-shepherd-state` ([durable state](cloud.md#durable-state))                                                                                                                   |
| macOS                                            | `pr-shepherd-state` in the per-user temp dir (`getconf DARWIN_USER_TEMP_DIR`), not `$TMPDIR`, so sandboxed and unsandboxed runs share state                                                      |
| Linux                                            | `/tmp/pr-shepherd-state-<uid>` (created mode `0700`) when it is a real directory you own, not group- or world-writable, and readable, writable, and searchable; else `$TMPDIR/pr-shepherd-state` |
| Other platforms                                  | `os.tmpdir()`                                                                                                                                                                                    |

Per-repository files live at `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/`; separate owner and repository directories keep hyphenated names from colliding. Directories written by older builds as `<owner>-<repo>` are no longer read, so the first run after upgrading starts clean (seen comments can surface once, ready-delay restarts). `pr-shepherd admin clean all` removes the whole base, including those leftovers.
