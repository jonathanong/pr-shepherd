# pr-shepherd configuration

[← README](../README.md)

pr-shepherd looks for a `.pr-shepherdrc.yml` file starting from the current working directory and walking up to `$HOME`. The first file found wins. All fields are optional — built-in defaults apply when omitted.

## Example

```yaml
iterate:
  cooldownSeconds: 60 # wait 60s after a push before reading CI
  fixAttemptsPerThread: 5 # raise before escalating to manual review

watch:
  interval: 4m # /loop cadence
  readyDelayMinutes: 10 # settle window after PR first becomes READY
  expiresHours: 8 # max loop lifetime

resolve:
  concurrency: 4
  shaPoll:
    intervalMs: 2000
    maxAttempts: 10

checks:
  ciTriggerEvents:
    - pull_request
    - pull_request_target
  timeoutPatterns:
    - cancel timeout
    - exceeded the maximum execution time
  infraPatterns:
    - runner error
    - ECONNRESET
  logMaxLines: 50
  logMaxChars: 3000

mergeStatus:
  blockingReviewerLogins:
    - copilot
    - sonar # add other review bots here

actions:
  autoResolveOutdated: true
  autoRebase: true
  autoMarkReady: true
```

---

## `cache`

### `cache.ttlSeconds` — default `300`

How long (in seconds) the batch GraphQL response is cached on disk. A cache hit means a cron tick costs zero API calls.

- **Raise** if you're running many parallel shepherd instances and want to reduce API usage.
- **Lower** (or set to `0`) if you need fresh data on every tick — useful when debugging.
- **Override per invocation**: `--no-cache` flag or `--cache-ttl N`.

> Interaction: setting `ttlSeconds` shorter than `iterate.cooldownSeconds` means cache is always cold during the cooldown window — no harm, just wasted reads.

---

## `iterate`

### `iterate.cooldownSeconds` — default `30`

How long (in seconds) shepherd waits after the most recent commit before calling GitHub. CI hasn't started yet for very recent pushes; polling immediately produces noise and wastes API calls.

- **Raise** if your CI takes a long time to queue (e.g. self-hosted runners with startup latency).
- **Lower** if you want faster initial feedback after a push.

### `iterate.fixAttemptsPerThread` — default `3`

Maximum number of times shepherd dispatches the `fix_code` action for the same review thread without it being resolved. Once a thread hits this count, shepherd escalates to the `escalate` action instead of retrying.

The counter resets automatically when a new commit is pushed (HEAD SHA change).

- **Raise** for complex threads that may require multiple fix-push-review cycles.
- **Lower** if you want to escalate to human review sooner.

---

## `watch`

These values are read by the `/pr-shepherd:monitor` skill when setting up the `/loop`.

### `watch.interval` — default `"4m"`

The `/loop` polling cadence. Format: `"Nm"` for minutes, `"Nh"` for hours.

The default of 4 minutes is chosen to keep Claude's prompt cache warm — the cache TTL is 5 minutes, so a 4-minute loop means each tick still benefits from a warm cache.

- **Raise** if you want a lighter polling footprint.
- **Lower** if you want faster detection of CI state changes (costs more API budget).

### `watch.readyDelayMinutes` — default `10`

After the PR first reaches READY status (all checks green, no open threads), shepherd continues to loop for this many minutes before cancelling the loop. This settle window gives reviewers time to request changes or for a Copilot review to finish.

The ready-delay countdown resets if the PR drops out of READY state at any tick.

### `watch.expiresHours` — default `8`

Maximum lifetime of a monitor loop, expressed in hours. After this time the loop stops regardless of PR state. The `/loop` skill receives this as `--expires Nh`.

### `watch.maxTurns` — default `50`

Maximum number of iterations before the `/loop` skill stops. This is the `--max-turns` argument, which counts iterations, not turns of dialogue. With a 4-minute interval, 50 turns ≈ 3.3 hours.

---

## `resolve`

### `resolve.concurrency` — default `4`

Maximum number of parallel GraphQL mutations when resolving threads, minimizing comments, or dismissing reviews. GitHub's secondary rate limits start biting around 10 simultaneous mutations.

- **Lower** if you see `HTTP 403: secondary rate limit` errors.
- **Raise** cautiously for PRs with many threads.

### `resolve.fetchReviewSummaries` — default `true`

When `true`, `pr-shepherd resolve --fetch` includes COMMENTED review summaries (PR-level overview bodies, like those produced by `copilot-pull-request-reviewer` and `gemini-code-assist`) in the `reviewSummaries` array returned to the agent. The agent classifies each one through the normal triage flow and minimizes it via `--minimize-comment-ids` as appropriate.

Set to `false` to opt out entirely — the agent will not see or act on review summaries for this repository.

Note: the GraphQL batch query always fetches review summaries regardless of this flag; only their exposure to the agent is gated. This keeps the shared batch query simple.

### `resolve.shaPoll`

Controls the push-safety polling used when `--require-sha <SHA>` is passed to `pr-shepherd resolve`.

#### `resolve.shaPoll.maxAttempts` — default `10`

Maximum polling attempts before giving up and throwing. At the default interval of 2000ms, this means up to ~18 seconds of waiting for GitHub to acknowledge the push.

#### `resolve.shaPoll.intervalMs` — default `2000`

Milliseconds between each poll attempt.

---

## `checks`

### `checks.ciTriggerEvents` — default `["pull_request", "pull_request_target"]`

Only check runs triggered by one of these events count toward CI readiness. Runs from `push`, `schedule`, `workflow_dispatch`, `merge_group`, etc. are classified as `filtered` and do not block the READY verdict.

Common additions:

- `merge_group` — for repos using GitHub's merge queue.
- Remove `pull_request_target` for repos that don't use it (reduces noise).

### `checks.timeoutPatterns` — default: see [`src/config.json`](../src/config.json)

Case-insensitive strings matched against the trimmed failure log. If any pattern matches, the check is classified as `timeout` and shepherd retries the run (`rerun_ci` action) rather than treating it as an actionable failure.

Example: adding `"operation timed out"` classifies any run whose log contains that phrase as a transient timeout.

### `checks.infraPatterns` — default: see [`src/config.json`](../src/config.json)

Same matching logic as `timeoutPatterns`, but classifies the check as `infrastructure` (e.g. a runner crashed). These are also retried via `rerun_ci`.

> `timeoutPatterns` are checked first; `infraPatterns` only apply if the timeout test did not match.

### `checks.logMaxLines` — default `50`

The last N lines of each failing check's log are kept for triage. Larger values give better context but increase memory usage and the size of the `fix_code` payload.

### `checks.logMaxChars` — default `3000`

Character cap applied after the line limit. The excerpt is trimmed to the last N characters. Combined with `logMaxLines`, this bounds the payload size.

---

## `mergeStatus`

### `mergeStatus.blockingReviewerLogins` — default `["copilot"]`

A list of reviewer login prefixes (case-insensitive, matched with `startsWith`). When any reviewer matching one of these prefixes has a pending review request or a `PENDING` review state, shepherd treats the PR as `BLOCKED` and does not mark it ready for review.

Add other review bots (e.g. `sonar`, `codeclimate`, `reviewdog`) if they submit GitHub reviews that must complete before the PR is mergeable.

---

## `actions`

These flags control whether shepherd automatically performs each class of mutation during an `iterate` tick. The corresponding `--no-auto-*` CLI flags provide per-invocation overrides.

### `actions.autoResolveOutdated` — default `true`

When `true`, shepherd automatically resolves threads that GitHub has marked `isOutdated` at the start of each tick. Disable if your team uses outdated threads as a deliberate signal (e.g. "fix this when you rebase").

### `actions.autoRebase` — default `true`

When `true`, shepherd returns `action: rebase` when it detects a flaky failure and the branch is `BEHIND` the base. The `/pr-shepherd:monitor` skill then runs `git fetch && git rebase && git push --force-with-lease`.

Disable for repos that enforce merge commits or use a merge queue where rebasing is handled automatically.

### `actions.autoMarkReady` — default `true`

When `true`, shepherd converts a draft PR to ready-for-review once all checks pass and the ready-delay has elapsed.

Disable if your team uses the draft state as a deliberate gate that requires a human to promote.

---

## Environment variables

| Variable                        | Effect                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `PR_SHEPHERD_CACHE_DIR`         | Override the cache base directory (default `$TMPDIR/pr-shepherd-cache`)                                          |
| `PR_SHEPHERD_CACHE_TTL_SECONDS` | Override `cache.ttlSeconds`. Precedence: `--cache-ttl` > this env var > RC/config value.                         |
| `GH_TOKEN` / `GITHUB_TOKEN`     | GitHub auth token. Resolution order: `GH_TOKEN` → `GITHUB_TOKEN` → `gh auth token` fallback (requires `gh` CLI). |

## Deprecated keys

The following keys from earlier versions are still accepted but emit a deprecation warning to stderr. They will be removed in a future release.

| Old key                          | New key                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `iterate.maxFixAttempts`         | `iterate.fixAttemptsPerThread`                            |
| `watch.intervalDefault`          | `watch.interval`                                          |
| `watch.readyDelayMinutesDefault` | `watch.readyDelayMinutes`                                 |
| `watch.expiresHoursDefault`      | `watch.expiresHours`                                      |
| `resolve.shaPollIntervalMs`      | `resolve.shaPoll.intervalMs`                              |
| `resolve.shaPollMaxAttempts`     | `resolve.shaPoll.maxAttempts`                             |
| `checks.relevantEvents`          | `checks.ciTriggerEvents`                                  |
| `checks.logLinesKept`            | `checks.logMaxLines`                                      |
| `checks.logExcerptMaxChars`      | `checks.logMaxChars`                                      |
| `baseBranch`                     | _(removed — auto-detected from PR)_                       |
| `minimizeBots`                   | _(removed)_                                               |
| `cancelCiOnFailure`              | _(removed)_                                               |
| `execution.maxBufferMb`          | _(removed — no subprocess buffer caps with native fetch)_ |
| `execution.triageLogBufferMb`    | _(removed — no subprocess buffer caps with native fetch)_ |
