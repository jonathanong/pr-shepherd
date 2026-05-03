# pr-shepherd configuration

[← README](../README.md)

pr-shepherd looks for a `.pr-shepherdrc.yml` file starting from the current working directory and walking up to `$HOME`. The first file found wins. All fields are optional — built-in defaults apply when omitted.

## Example

```yaml
iterate:
  cooldownSeconds: 60 # wait 60s after a push before reading CI
  fixAttemptsPerThread: 5 # raise before escalating to manual review
  stallTimeoutMinutes: 30 # escalate if state unchanged for this many minutes
  minimizeApprovals: false # set true to also minimize APPROVED-state reviews

watch:
  interval: 4m # /loop cadence
  readyDelayMinutes: 10 # settle window after PR first becomes READY

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

actions:
  autoResolveOutdated: true
  autoMarkReady: true
  commitSuggestions: true
```

---

## All supported keys

| Key                                  | Default                                   | Purpose                                                                                                                                |
| ------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `iterate.cooldownSeconds`            | `30`                                      | Wait after a push before reading CI                                                                                                    |
| `iterate.fixAttemptsPerThread`       | `3`                                       | Max fix attempts per unresolved thread before `escalate`                                                                               |
| `iterate.stallTimeoutMinutes`        | `30`                                      | Minutes the loop may repeat the same action without progress before `escalate` with `stall-timeout`; `0` disables                      |
| `iterate.minimizeApprovals`          | `false`                                   | Opt in to also minimize APPROVED-state reviews (also enables >50-approval pagination). All `COMMENTED` summaries are always minimized. |
| `watch.interval`                     | `"4m"`                                    | Monitor tick interval (tuned to Claude's 5-min prompt-cache TTL)                                                                       |
| `watch.readyDelayMinutes`            | `10`                                      | Settle window after READY before the monitor loop cancels                                                                              |
| `resolve.shaPoll.intervalMs`         | `2000`                                    | Poll interval when waiting for `--require-sha` to land on GitHub                                                                       |
| `resolve.shaPoll.maxAttempts`        | `10`                                      | Max `--require-sha` polls before giving up                                                                                             |
| `resolve.fetchReviewSummaries`       | `true`                                    | Surface `COMMENTED` review summaries in `resolve --fetch` output                                                                       |
| `checks.ciTriggerEvents`             | `["pull_request", "pull_request_target"]` | Workflow `on:` events treated as PR CI (add `merge_group` for merge-queue repos)                                                       |
| `mergeStatus.blockingReviewerLogins` | `["copilot"]`                             | Reviewer logins whose pending review or outstanding review request blocks `mark_ready`                                                 |
| `actions.autoResolveOutdated`        | `true`                                    | Auto-resolve threads that point to code no longer in the PR diff                                                                       |
| `actions.autoMarkReady`              | `true`                                    | Emit `mark_ready` when a draft PR's CI goes clean                                                                                      |
| `actions.commitSuggestions`          | `true`                                    | Route `/pr-shepherd:resolve` through `commit-suggestion` (singular) for threads with a ` ```suggestion ` block                         |

---

## Agent detection

`pr-shepherd` uses the calling-agent environment only to choose instruction wording. `AGENT=codex` and `CODEX_CI=1` select Codex-compatible monitor output. Other environments keep the default Claude-compatible `/loop` instructions.

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

### `iterate.stallTimeoutMinutes` — default `30`

Maximum number of minutes the monitor loop will repeat the same action without material progress before escalating with the `stall-timeout` trigger. "Material progress" means any change to: HEAD SHA, the set of failing check names, actionable thread/comment/review IDs, or the review-summary minimize bucket.

The stall timer resets automatically whenever the fingerprint changes (new commit, resolved thread, different CI failure, etc.).

Override per-invocation with `--stall-timeout <duration>` (e.g. `--stall-timeout 1h`, `--stall-timeout 0` to disable).

- **Raise** for workflows where CI can legitimately take longer than 30 minutes without any state change.
- **Lower** if you want faster escalation when a PR gets stuck.
- **Set to `0`** to disable stall detection entirely.

### `iterate.minimizeApprovals` — default `false`

**Breaking change from `iterate.minimizeReviewSummaries.{bots, humans, approvals}`** — the old nested keys are no longer recognized.

All `COMMENTED` review summaries (bot and human alike) are always minimized by the monitor / `iterate` loop. Review summary IDs ride along inside the existing resolve command — no code change needed to minimize them. Rendered under `## Review summaries (minimize only)` in the iterate markdown output.

Opt in to also minimize `APPROVED`-state reviews (`pr approve` clicks with or without a body). Off by default because approvals are an affirmative signal you usually want to keep visible. Flip to `true` for long-running PRs where stale approvals pile up.

When `false` (default), approval reviews are surfaced under `## Approvals (surfaced — not minimized)` only in iterate output that is already being emitted for other actionable work (for example, alongside a `fix_code` payload). They remain visible and are not passed to `--minimize-comment-ids`, but approvals by themselves do not cause iterate to emit that section instead of returning `wait`.

> Perf note: when this is `false` (default), `fetchPrBatch` does not paginate beyond the first 50 approved reviews. Turn it on to fetch all approvals.

---

## `watch`

These values are read by the `/pr-shepherd:monitor` skill when setting up the `/loop`.

### `watch.interval` — default `"4m"`

The `/loop` polling cadence. Format: `"Nm"` for minutes, `"Nh"` for hours.

The default of 4 minutes is chosen to keep Claude's prompt cache warm — the cache TTL is 5 minutes, so a 4-minute loop means each tick still benefits from a warm cache.

- **Raise** if you want a lighter polling footprint.
- **Lower** if you want faster detection of CI state changes (costs more API budget).

> These `watch.*` keys are the only way to tune the loop interval and ready-delay. The `/pr-shepherd:monitor` skill reads them from config via `npx pr-shepherd monitor` — there are no per-invocation flags.

### `watch.readyDelayMinutes` — default `10`

After the PR first reaches READY status (all checks green, no open threads), shepherd continues to loop for this many minutes before cancelling the loop. This settle window gives reviewers time to request changes or for a Copilot review to finish.

The ready-delay countdown resets if the PR drops out of READY state at any tick.

---

## `resolve`

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

---

## `mergeStatus`

### `mergeStatus.blockingReviewerLogins` — default `["copilot"]`

A list of reviewer login prefixes (case-insensitive, matched with `startsWith`). When any reviewer matching one of these prefixes has a pending review request or a `PENDING` review state, shepherd treats the PR as `BLOCKED` and does not mark it ready for review.

Add other review bots (e.g. `sonar`, `codeclimate`, `reviewdog`) if they submit GitHub reviews that must complete before the PR is mergeable.

---

## `actions`

These flags control whether shepherd automatically performs each class of mutation during an `iterate` tick. The corresponding `--no-auto-*` CLI flags provide per-invocation overrides.

### `actions.autoResolveOutdated` — default `true`

When `true`, shepherd automatically resolves threads that GitHub has marked `isOutdated` at the start of each tick. The agent still sees them on first encounter (tagged `[status: outdated, auto-resolved]` in the `## First-look items` section) so reviewer intent is acknowledged before the thread disappears. Disable if your team uses outdated threads as a deliberate signal (e.g. "fix this when you rebase") — with this flag off, outdated threads still surface as `[status: outdated]` first-look items but are not auto-resolved.

### `actions.autoMarkReady` — default `true`

When `true`, shepherd converts a draft PR to ready-for-review once all checks pass and the ready-delay has elapsed.

Disable if your team uses the draft state as a deliberate gate that requires a human to promote.

### `actions.commitSuggestions` — default `true`

When `true`, the `/pr-shepherd:resolve` skill prefers applying reviewer-authored ` ```suggestion ` blocks via [`pr-shepherd commit-suggestion`](cli-usage.md#pr-shepherd-commit-suggestion-pr---thread-id-id---message) (singular, one per thread) — creating a local commit per suggestion that co-credits the reviewer — rather than having the agent re-type the fix. Each `actionableThread` returned by `resolve --fetch` is annotated with a parsed `suggestion` field, and the fetch payload exposes `commitSuggestionsEnabled` mirroring this flag.

Disable if you want the agent to read and re-implement every suggestion (e.g. because your team prefers all commits to come from a single author, or because you want an extra human-ish review pass over every change). Flipping this to `false` still surfaces `suggestion` blocks in the fetch payload so the agent has the reviewer's exact proposal available as context; the skill just falls through to its manual-edit path.

---

## Environment variables

| Variable                                                     | Effect                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PR_SHEPHERD_STATE_DIR`                                      | Override the loop-state base directory (default `$TMPDIR/pr-shepherd-state`)                                                                      |
| `GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub auth token. Resolution order: `GH_TOKEN` → `GITHUB_TOKEN` → `gh auth token` fallback (requires `gh` CLI) → `GITHUB_PERSONAL_ACCESS_TOKEN`. |
