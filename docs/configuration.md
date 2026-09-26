# pr-shepherd configuration

[← README](../README.md)

pr-shepherd loads every `.pr-shepherdrc.yml` starting from the current working directory and walking toward `$HOME`, then deep-merges them ESLint-style: closer files override farther ones, nested objects merge, and arrays replace. `$HOME/.pr-shepherdrc.yml` is always included as the farthest user-level overlay when it exists, even if the working directory is outside `$HOME`. When cwd is outside `$HOME`, the walk includes ancestor directories of cwd but stops before the filesystem root, so `/.pr-shepherdrc.yml` cannot override the user file. All fields are optional — built-in defaults apply when omitted. The MCP server and CLI read the same files. These knobs tune what context is gathered (ignore checks, bot usernames, classification) and which actions iterate may take automatically.

For example, a user-level file at `$HOME/.pr-shepherdrc.yml` can set personal defaults, and a project file can override only the keys it cares about:

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

From the repo, the merged result keeps `ignoreChecks` and `stallTimeoutMinutes` from `$HOME` and uses `fixAttemptsPerThread: 5` from the project file. Built-in defaults fill every other key. If both files set `ignoreChecks`, the closer file's list replaces the farther one.

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
  behindBaseHint: "rebase --force-with-lease" # one-liner shown on the fix_code push step when behind base
  resolveOtherHumanThreads: none # none | outdated | always

poll:
  intervalSeconds: 120 # single-PR delay between WAIT ticks
  stackIntervalFactor: 2 # stack and multi-PR polls sleep intervalSeconds times this
  timeoutSeconds: 270 # default bounded WAIT timeout; ignored by --until-terminal
  debounceSeconds: 60 # settle window after first FIX_CODE; 0 disables
  quietStatus: false # unchanged WAIT snapshots remain visible by default

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
  commandArgs:
    - --squash
    - --delete-branch

actions:
  autoMinimizeSuppressed: true
  autoMarkReady: true
  neverCancelRuns:
    - "Final Code Review"
  workWhileQueued: false # set true to act on non-CI work immediately instead of waiting until the PR leaves the merge queue
```

---

## All supported keys

| Key                                  | Default                                   | Purpose                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cliCommand`                         | `["pr-shepherd"]`                         | Argv prefix for every `pr-shepherd` command Shepherd emits; set it when the CLI is a project dependency rather than a global install                        |
| `botUsernames`                       | Known code-review bot logins              | GitHub logins treated as bots for repeat unresolved-thread visibility even when GitHub reports them as `User` or `Unknown`                                  |
| `ignoreChecks`                       | `[]`                                      | Case-insensitive globs that exclude check/status contexts from CI decisions and details while retaining their names in the ignored rollup                   |
| `iterate.fixAttemptsPerThread`       | `3`                                       | Caller-visible `FIX_CODE` deliveries allowed for one unchanged unresolved thread body before the following tick escalates                                   |
| `iterate.stallTimeoutMinutes`        | `60`                                      | Minutes the loop may repeat the same action without progress, or CI may stay pending without starting, before `escalate` with `stall-timeout`; `0` disables |
| `iterate.minimizeApprovals`          | `false`                                   | Opt in to also minimize APPROVED-state reviews (also enables >50-approval pagination).                                                                      |
| `iterate.minimizeComments`           | `"all"`                                   | Which non-human GitHub author classes to minimize for PR comments and review summaries: `all`, `bots`, or `none`; humans are never minimized.               |
| `iterate.behindBaseHint`             | `""`                                      | One-liner shown on the `fix_code` push step when the branch is behind its base; empty omits the hint entirely                                               |
| `iterate.resolveOtherHumanThreads`   | `"none"`                                  | When to resolve other-human inline threads after a reply: `none` (reply-only), `outdated` (also resolve when GitHub reports outdated), or `always`          |
| `poll.intervalSeconds`               | `60`                                      | Default delay between `WAIT` ticks for one PR; overridden by `--interval`                                                                                   |
| `poll.stackIntervalFactor`           | `2`                                       | Multiplier for --stack and multi-PR sleeps (`intervalSeconds` × this). `--interval` overrides it and is not multiplied                                      |
| `poll.timeoutSeconds`                | `270`                                     | Default wall-clock cap for bounded `WAIT` polling; overridden by `--timeout` and ignored by `--until-terminal`                                              |
| `poll.debounceSeconds`               | `60`                                      | Default settle window after the first `FIX_CODE`; overridden by `--debounce`; `0` disables                                                                  |
| `poll.quietStatus`                   | `false`                                   | Whether unchanged `WAIT` snapshots are hidden by default; overridden by `--quiet-status` or `--no-quiet-status`                                             |
| `watch.readyDelayMinutes`            | `10`                                      | Settle window after READY before the monitor loop cancels                                                                                                   |
| `watch.graphqlQuotaWarnings`         | `30% → 2x, 20% → 5x, 10% → 10x`           | One-time per-worktree GraphQL and REST core quota warnings, and the minimum poll intervals the poll dispatcher applies; `[]` disables                       |
| `resolve.shaPoll.intervalMs`         | `2000`                                    | Poll interval when waiting for `--require-sha` to land on GitHub                                                                                            |
| `resolve.shaPoll.maxAttempts`        | `10`                                      | Max `--require-sha` polls before giving up                                                                                                                  |
| `checks.ciTriggerEvents`             | `["pull_request", "pull_request_target"]` | Workflow `on:` events treated as PR-head CI; merge-queue `merge_group` checks are included automatically                                                    |
| `checks.ignoreLogLines`              | `[]`                                      | Regex patterns matched against each raw CI log line; matching lines are dropped from `## Failing checks` log excerpts and from check-annotation dedup       |
| `mergeStatus.blockingReviewerLogins` | `["copilot"]`                             | Reviewer logins whose pending review or outstanding review request blocks `mark_ready`                                                                      |
| `merge.commandArgs`                  | `[]`                                      | Options for ordinary `gh pr merge` commands; defaults to `--merge` when no strategy is selected. Not used for merge-queue commands.                         |
| `actions.autoMinimizeSuppressed`     | `true`                                    | Resolve/minimize classification matches with both flags, then print, report, and journal the result                                                         |
| `actions.autoMarkReady`              | `true`                                    | Emit `mark_ready` when a draft PR reaches a clean ready state                                                                                               |
| `actions.neverCancelRuns`            | `[]`                                      | Legacy cancellation-named patterns; matching checks remain visible despite `ignoreChecks`, but Shepherd never cancels runs                                  |
| `actions.workWhileQueued`            | `false`                                   | When `true`, act on non-CI actionable work immediately even while the PR is in the merge queue, instead of deferring it until the PR leaves the queue       |

## `cliCommand` — default `["pr-shepherd"]`

Argv prefix for every `pr-shepherd` command Shepherd emits: follow-up `--stack` and per-PR session commands, `apply review` and `apply journal` mutations, and commit-suggestion commands, in Markdown, JSON, and MCP output alike. The default assumes `pr-shepherd` is on `PATH`. A repository that pins pr-shepherd as a dependency should set its package-manager launcher so agents run the pinned version instead of whatever global install `PATH` resolves first:

```yaml
cliCommand:
  - pnpm
  - exec
  - pr-shepherd
```

The value must be a non-empty list of non-empty strings; any other value is rejected like every other invalid key. Shepherd shell-quotes each launcher argument when it renders command text.

## `botUsernames`

Top-level list of GitHub logins that Shepherd treats as bot authors in addition to GitHub-detected bots (`authorType: Bot`) and logins containing `[bot]`.

Configured bot threads are returned on every tick until resolved, even if their transcript is unchanged and already seen. Configured bot comments and reviews also follow bot minimization/routing policy when eligible. Viewer-authored human threads also stay visible until resolved. Other-human active threads remain marker-gated so Shepherd does not repeatedly return unchanged feedback unless `iterate.resolveOtherHumanThreads` is `always`.

Matching is case-insensitive and treats a trailing `[bot]` suffix as equivalent to the bare login.

## `ignoreChecks`

Top-level list of case-insensitive glob patterns for GitHub check/status context names Shepherd should ignore for CI decisions. Ignored checks do not affect readiness, detailed check summaries, triage, or stall detection. Their names remain in the `ignoredNames` JSON field and the `**ignored**` text rollup.

For GitHub Actions check runs, `actions.neverCancelRuns` takes precedence over `ignoreChecks` when it matches the workflow name or raw check name for the same run. Use this when a protected long-running workflow has child job names that would otherwise match `ignoreChecks`.

Use exact names for one context, or glob patterns when a service emits multiple related contexts:

```yaml
ignoreChecks:
  - "Kilo Code Review"
  - "Preview Deploy *"
```

The pattern is matched against Shepherd's normalized check name (`CheckRun.name` or `StatusContext.context`), not the workflow display name.

## `iterate`

### `iterate.fixAttemptsPerThread` — default `3`

Maximum number of caller-visible `fix_code` results that may return the same surfaced review thread body without it being resolved or changed. Each result repeats the pending review commands. After the configured number of results has been delivered, the next unchanged tick escalates and retains those commands. Internal polling/debounce ticks do not count.

The counter is keyed by the thread transcript hash. If the author edits or replies in the thread, the hash changes and the per-thread counter resets. Threads suppressed by seen markers do not increment this counter.

- **Raise** for complex threads that may require multiple fix-push-review cycles.
- **Lower** if you want to escalate to human review sooner.

### `iterate.stallTimeoutMinutes` — default `60`

Maximum number of minutes the monitor loop will repeat the same action without material progress before escalating with the `stall-timeout` trigger. "Material progress" means any change to: HEAD SHA, the set of failing check names, actionable thread/comment/review IDs, or the review-summary minimize bucket.

The same timeout also applies to CI that has not started: relevant queued/requested/waiting check runs, or pending external status contexts, escalate when their latest source activity time is older than this threshold and no start timestamp exists. For check runs, Shepherd uses `updatedAtUnix` when GitHub exposes it and falls back to `createdAtUnix`.

The stall timer resets automatically whenever the fingerprint changes (new commit, resolved thread, different CI failure, etc.).

A `--stack` selection whose remaining layers can only wait uses the same threshold for its own stack-level timer; see [`stall-timeout`](escalations.md#stall-timeout).

Override per-invocation with `--stall-timeout <duration>` (e.g. `--stall-timeout 1h`, `--stall-timeout 90s`, `--stall-timeout 0` to disable). A bare number is minutes; an explicit `s`/`m`/`h` suffix always works.

- **Raise** for workflows where CI can legitimately take longer than 60 minutes without any state change.
- **Lower** if you want faster escalation when a PR gets stuck.
- **Set to `0`** to disable stall detection entirely.

### `iterate.minimizeApprovals` — default `false`

Non-human `COMMENTED` review summaries can be minimized by the `iterate` loop. Human-authored summaries are surfaced through seen markers and are never minimized. Review summary IDs are returned in the `iterate` mutation plan and applied with the MCP `apply` tool. Rendered under `## Review IDs to minimize queue` in the iterate markdown output.
`iterate.minimizeComments` controls which authors are eligible for that minimization.

Opt in to also minimize `APPROVED`-state reviews (`pr approve` clicks with or without a body). Off by default because approvals are an affirmative signal you usually want to keep visible. Flip to `true` for long-running PRs where stale approvals pile up. When enabled, `iterate.minimizeComments` still filters which approval authors are minimized; approvals excluded by that policy are surfaced instead.

When `false` (default), approval reviews are surfaced under `## Approvals (surfaced — not minimized)` only in iterate output that is already being emitted for other actionable work (for example, alongside a `fix_code` payload). They remain visible and are not passed to `--minimize-comment-ids`, but approvals by themselves do not cause iterate to emit that section instead of returning `wait`.

When `true`, an approval that cannot be minimized because policy excludes it or GitHub does not report `viewerCanMinimize: true` produces a one-time `FIX_CODE` visibility tick. It remains absent from `--minimize-comment-ids` and is marker-gated afterward.

> Perf note: when this is `false` (default), `fetchPrBatch` does not paginate beyond the first 50 approved reviews. Turn it on to fetch all approvals.

### `iterate.minimizeComments` — default `"all"`

Controls which non-human GitHub-classified author types are passed to `--minimize-comment-ids` for minimizable PR comments, `COMMENTED` review summaries, and approval reviews when `iterate.minimizeApprovals` is enabled. A human author is `authorType: User` with no `[bot]` in the login; human-authored items are never minimized.

- `"all"` minimizes Bot and Unknown authors.
- `"bots"` minimizes only GitHub `Bot` authors.
- `"none"` surfaces minimizable comments/reviews but does not auto-minimize them.

Items excluded by this policy still go through seen markers: Shepherd surfaces them the first time it sees them, writes a body hash marker, suppresses unchanged repeats on later ticks, and re-surfaces them if the author edits the body in place.

### `iterate.behindBaseHint` — default `""`

One-liner appended to the `fix_code` push instruction when the branch is behind its base (`mergeStatus: "BEHIND"`) — e.g. `"rebase --force-with-lease"`, `"merge the main branch"`, or `"see .agents/skills/agent-workflow/git-and-prs.md"`. Shepherd never decides the convention itself (see [`docs/actions.md`](actions.md) on why rebase/merge mechanics are intentionally left to the caller) — it only echoes back whatever pointer you configure here.

Empty (default) omits the hint entirely.

### `iterate.resolveOtherHumanThreads` — default `"none"`

Controls when Shepherd resolves **other-human** inline threads (User authors that are not in `botUsernames`) after it replies. Bot/non-human threads and viewer-authored human threads always reply-and-resolve, including when GitHub has cleared the source line.

- `"none"` (default) — other humans stay reply-only. A marker-ended other-human thread is already acknowledged and has no further mutation.
- `"outdated"` — other humans still always get a reply when unmarked; Shepherd also resolves when GitHub reports `isOutdated: true`. Marker-ended outdated other-human threads become resolve-only retries.
- `"always"` — other humans use the same reply-and-resolve pairing as own comments, including marker-ended resolve-only retries.

```yaml
iterate:
  resolveOtherHumanThreads: outdated
```

---

## `poll`

Configures defaults for the polling CLI. Explicit command-line flags take precedence, so a repository can establish a normal cadence without preventing a caller from choosing a different one:

```yaml
poll:
  intervalSeconds: 120
  stackIntervalFactor: 2
  timeoutSeconds: 270
  debounceSeconds: 60
  quietStatus: false
```

`intervalSeconds` and `timeoutSeconds` must be positive finite numbers. `stackIntervalFactor` must be a finite number greater than or equal to 1 (built-in `2`). Their product, converted to milliseconds, must be finite and at most 2147483647 (the largest timer delay); a larger product is invalid and the whole config falls back to the built-in defaults. `debounceSeconds` must be a non-negative finite number; `0` disables the post-`FIX_CODE` settle window. `quietStatus` defaults to `false`, preserving the ordinary status line for every `WAIT` tick. Use `--quiet-status` to hide unchanged snapshots for one invocation or `--no-quiet-status` to override a configured `true` value.

One PR, including `--until-terminal`, sleeps `intervalSeconds` or the explicit `--interval`. A stack or multi-PR poll sleeps `intervalSeconds * stackIntervalFactor` when `--interval` is omitted. The flag is that invocation's interval and is not multiplied again. The product stays a positive finite number of seconds and is not rounded. Quota-warning bands stay multiples of configured `intervalSeconds` only, so the stack factor does not compound into them. The dispatcher sleeps the slower of the effective interval and the active band: with the built-in defaults a stack sleeps 120s until a tighter band is slower than that.

These settings affect `pr-shepherd [PR]` and `pr-shepherd poll`. Single-tick `iterate` and MCP calls do not poll. `--until-terminal` ignores the bounded timeout, as it does when the timeout comes from `--timeout`.

---

## `watch`

### `watch.readyDelayMinutes` — default `10`

After the PR first reaches a clean READY state (checks green, no Shepherd-visible work, no blocking bot review pending), Shepherd continues to loop for this many minutes before cancelling. This settle window gives reviewers time to request changes or for a configured blocking reviewer to finish.

The ready-delay countdown resets if the PR drops out of that ready state or its head changes at any tick. A newly surfaced hidden PR comment is acknowledged without resetting it. Lifecycle: [iterate-flow.md](iterate-flow.md#2-ready-delay).

### `watch.graphqlQuotaWarnings`

Configures low-GraphQL-quota warning bands. Each entry maps a remaining percentage to a recommended minimum polling cadence using `pollIntervalFactor`, `pollIntervalMinutes`, or both. A factor is multiplied by the configured `poll.intervalSeconds`; it does not use an invocation's explicit `--interval`, so repeated warnings cannot compound. When both forms are present, Shepherd uses the slower result.

The defaults are 30% → 2x, 20% → 5x, and 10% → 10x. With the built-in 60-second interval these preserve the previous 2-, 5-, and 10-minute cadence; with `poll.intervalSeconds: 120` they become 4, 10, and 20 minutes. Set the array to `[]` to disable warnings. Factors must be at least `1`, minute values must be positive, and the resolved interval must not decrease as remaining quota falls; invalid bands fall back to the defaults.

Shepherd evaluates the authoritative GraphQL response headers without making an extra rate-limit request. When a band is crossed, the next non-terminal agent-visible result includes the raw quota state and transport-specific continuation guidance. Bounded CLI guidance uses a timeout twice the recommended interval; MCP and single-tick callers are told how long to wait before the next call.

For normal cadence waits, the poll dispatcher (`pr-shepherd [PR]`, including `--until-terminal`, and aggregate `--stack` / multi-PR polls) applies the matching band: `max(effective interval, resolved band interval)`. A post-`FIX_CODE` or stack `SHEPHERD` debounce wait uses the remaining debounce window and is not quota-band adjusted. The effective interval is the explicit `--interval` when that flag is set; otherwise it is `poll.intervalSeconds` for one PR and `poll.intervalSeconds * poll.stackIntervalFactor` for a stack or multi-PR poll. Bands stay factored from configured `poll.intervalSeconds` only — not from `--interval` and not from the stack factor — so those multipliers do not compound. With the built-in defaults a stack therefore sleeps 120s until a tighter band is slower than that (the 30% band is also 120s; 20% and 10% are 5 and 10 minutes). The active band is the crossed entry with the lowest `remainingPercent`. A slower explicit interval is preserved in both sleep behavior and warning instructions. The throttle runs even after the one-shot warning has already been claimed for the window. Single-tick `iterate` and MCP `iterate` do not sleep — those callers own recurrence and only see the warning text. `--until-terminal` keeps polling through an exhausted primary limit until the reset plus a short margin, honors an explicit `Retry-After` in full, and exits 75 only after repeated attempts that do not move the reset time. A bounded poll still fails with 75 on the first rate-limit error. See [graphql.md](graphql.md).

Each band warns once per worktree and quota window. A new window is detected when GitHub's used count falls, remaining count rises, or GitHub advances the reset timestamp after the prior reset deadline has passed. A reset-time adjustment before the prior deadline does not re-arm warnings. If the first observed response is already below multiple bands, Shepherd emits only the lowest applicable band and records the higher bands as crossed.

---

## `resolve`

### `resolve.shaPoll`

Controls the push-safety polling used when `requireSha` is passed to an MCP `apply` `review_mutations` operation (or the CLI `apply review` command).

#### `resolve.shaPoll.maxAttempts` — default `10`

Maximum polling attempts before giving up and throwing. At the default interval of 2000ms, this means up to ~18 seconds of waiting for GitHub to acknowledge the push.

#### `resolve.shaPoll.intervalMs` — default `2000`

Milliseconds between each poll attempt.

---

## `checks`

### `checks.ciTriggerEvents` — default `["pull_request", "pull_request_target"]`

Only check runs triggered by one of these events count toward PR-head CI readiness. Runs from `push`, `schedule`, `workflow_dispatch`, `merge_group`, etc. are classified as `filtered` on that commit. Merge-queue commits are a separate source: their `merge_group` checks are included automatically while queued and after an ejection.

Common additions:

- Remove `pull_request_target` for repos that don't use it (reduces noise).

### `checks.ignoreLogLines` — default `[]`

Regex patterns (source strings) matched against each raw CI log line after ANSI/timestamp cleanup and first-failed-step isolation (run-command group and post-step cleanup already dropped; remaining group markers stripped). A matching line is dropped from `## Failing checks` log excerpts and consequently is not available for check-annotation deduplication either. Empty by default — Shepherd ships no built-in noise patterns, since what counts as noise is specific to each project's CI toolchain (test runner, build system).

```yaml
checks:
  ignoreLogLines:
    - "^\\[vitest-teardown\\]"
    - "^blob report written to"
    - "^Duration\\s+[\\d.]+m?s\\b"
```

An invalid regex anywhere in the list falls back to the previous/default config for the whole file, with a warning to stderr — the same behavior as every other validated config key.

---

## `merge`

`merge.commandArgs` is appended only to ordinary auto/direct `gh pr merge` commands emitted by `--merge`. Shepherd rejects the PR selector, `--repo`/`-R`, auto-mode controls (`--auto`/`--disable-auto`), `--match-head-commit`, privilege bypass via `--admin`, help flags (`--help`/`-h`), and file-reading body options (`--body-file`/`-F`), including attached short-option values. Select at most one of `--merge`/`-m`, `--squash`/`-s`, or `--rebase`/`-r`; boolean assignments such as `--squash=true` and safe short boolean bundles such as `-sd` are recognized. If none is configured, Shepherd adds `--merge`. Queue commands omit every configured option because the queue controls the merge method and does not accept branch deletion.

There is no config key to opt out of stack detection: when GitHub's batch query reports the PR is part of a native stack, a ready singular `--merge` poll returns non-terminal `FIX_CODE` directing the agent to the verified `--stack <PR URL> --until-terminal --merge` flow, so `merge.commandArgs` is never consulted for that PR. Native `--stack` selectors do not perform mutations: unready layers return stack-level `SHEPHERD` with one-PR routing, queued stacks return `WAIT`, and terminal READY or merged stacks return `CANCEL`. Closed or unverified topology returns `ESCALATE` for human direction only once no shepherdable layer remains; mixed states return `SHEPHERD` and retain the human blocker in the rows and instructions. A `--stack --merge` result returns `MERGE` for the highest ready prefix, then `CANCEL` only after every layer merges. See [merge-status.md](merge-status.md#merge-requirements) and [escalations.md#native-stack-merge-routing](escalations.md#native-stack-merge-routing).

---

## `mergeStatus`

### `mergeStatus.blockingReviewerLogins` — default `["copilot"]`

A list of reviewer login prefixes (case-insensitive, matched with `startsWith`). When any reviewer matching one of these prefixes has a pending review request or a `PENDING` review state, shepherd treats the PR as `BLOCKED` and does not mark it ready for review.

Add other review bots (e.g. `sonar`, `codeclimate`, `reviewdog`) if they submit GitHub reviews that must complete before the PR is mergeable.

---

## `actions`

These flags control whether shepherd automatically performs each class of mutation during an `iterate` tick. Some actions also have `--no-auto-*` CLI flags for per-invocation overrides.

### `actions.autoMinimizeSuppressed` — default `true`

When `true`, Shepherd applies the resolve/minimize mutation for classification-rule matches that set both `suppress: true` and `autoResolve: true` only when GitHub reports the exact per-object capability, then removes successful IDs from the agent-facing queues before `iterate` decides whether to emit `fix_code`. Each confirmed success is copied onto `threads.autoResolved` or `comments.autoMinimized` (with the rule `reason`, when one was set), printed in `## Classification auto-resolve` / `ruleAutoResolve`, and appended as one Shepherd Journal list item for the token login. Failures stay in `ruleAutoResolveIds`, `comments.minimizeIds`, or `ruleAutoResolveReviewSummaryIds` so the generated `apply review` command remains the retry path, and each failure is listed in that same section. A journal read or write failure is reported there too and does not undo the resolve or minimize. Denied or unverifiable items return to the normal first-look/edit visibility gate and produce no mutation recommendation.

When `false`, Shepherd does not call the mutation, write the journal, or print the line. The IDs stay on the generated `apply review` command, which is the same handoff used before this setting existed.

This applies only to explicit classification-rule auto-resolve matches. Ordinary `iterate.minimizeComments` policy queues and `autoResolve: true` rules without `suppress: true` still flow through the generated `apply review` command.

### `actions.autoMarkReady` — default `true`

When `true`, shepherd converts a draft PR to ready-for-review once all checks pass, no Shepherd-visible work remains, no configured blocking review is in progress, and the ready-delay has not yet elapsed. After the ready-delay elapses, the loop emits `cancel` instead.

Disabling stops only the poll loop's own transition. A `--stack` selection then lists a clean, unblocked draft layer's `gh pr ready` step for the agent after that layer's bounded probe; see [actions.md](actions.md).

### `actions.neverCancelRuns` — default `[]`

Legacy cancellation-named compatibility key. Shepherd no longer cancels or recommends cancelling workflow runs because GitHub exposes no exact viewer capability for that action. The patterns still keep matching Actions checks visible when `ignoreChecks` would otherwise hide them.

Use this for workflows where sibling jobs should be allowed to finish even after one job fails:

```yaml
actions:
  neverCancelRuns:
    - "Final Code Review"
```

For backward compatibility, a matching run remains visible and can block readiness even if a raw job name also matches `ignoreChecks`.

### `actions.workWhileQueued` — default `false`

When `false` (default), `iterate --merge` defers non-CI actionable work — review threads, PR comments, `CHANGES_REQUESTED` reviews, and review summaries — while the PR sits in the merge queue, since a Shepherd-initiated push right now would eject it from the queue. The tick emits `WAIT` with raw counts of what is held back (see [`docs/actions.md`](actions.md#wait)). Failing checks, unseen check-run annotations, and merge conflicts are never deferred — they always route to `fix_code` immediately regardless of this setting, since GitHub is already acting on the queue for those.

Set to `true` to restore the pre-existing behavior: actionable work is handled immediately even while the PR is queued.

```yaml
actions:
  workWhileQueued: true
```

---

## Environment variables

| Variable                                                     | Effect                                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PR_SHEPHERD_STATE_DIR`                                      | Override the loop-state base directory. Default: `pr-shepherd-state` in the macOS per-user temp dir (`getconf DARWIN_USER_TEMP_DIR`) rather than `$TMPDIR`, so sandboxed and unsandboxed runs share state; `os.tmpdir()` on other platforms |
| `PR_SHEPHERD_LOG_DISABLED`                                   | Set to `1` to disable the per-worktree debug log                                                                                                                                                                                            |
| `PR_SHEPHERD_LOG_MAX_BODY`                                   | Max characters of each logged HTTP body (default `262144`). Larger bodies are truncated.                                                                                                                                                    |
| `GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub auth token. Resolution order: `GH_TOKEN` → `GITHUB_TOKEN` → `gh auth token` fallback (requires `gh` CLI) → `GITHUB_PERSONAL_ACCESS_TOKEN`. See [authentication.md](authentication.md) for required PAT access.                       |

Per-repository files live at `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/`. Owner and repository are separate directories, so names that contain hyphens cannot collide. Directories written by older builds as `<owner>-<repo>` are left in place and are no longer read. The next run starts clean: seen comments can surface once, and ready-delay starts over. `pr-shepherd admin clean all` removes the whole base, including those leftover directories.
