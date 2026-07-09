# pr-shepherd configuration

[← README](../README.md)

pr-shepherd looks for a `.pr-shepherdrc.yml` file starting from the current working directory and walking up to `$HOME`. The first file found wins. All fields are optional — built-in defaults apply when omitted.

## Example

```yaml
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
  minimizeComments: all # all | bots | users | none

watch:
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
  autoMinimizeSuppressed: true
  autoMarkReady: true
  commitSuggestions: true
  neverCancelRuns:
    - "Final Code Review"
```

---

## All supported keys

| Key                                  | Default                                   | Purpose                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `botUsernames`                       | Known code-review bot logins              | GitHub logins treated as bots for repeat unresolved-thread visibility even when GitHub reports them as `User` or `Unknown`                                  |
| `ignoreChecks`                       | `[]`                                      | Case-insensitive glob patterns for check/status context names Shepherd should ignore completely                                                             |
| `iterate.fixAttemptsPerThread`       | `3`                                       | Max fix attempts per surfaced unresolved thread body before `escalate`                                                                                      |
| `iterate.stallTimeoutMinutes`        | `60`                                      | Minutes the loop may repeat the same action without progress, or CI may stay pending without starting, before `escalate` with `stall-timeout`; `0` disables |
| `iterate.minimizeApprovals`          | `false`                                   | Opt in to also minimize APPROVED-state reviews (also enables >50-approval pagination).                                                                      |
| `iterate.minimizeComments`           | `"all"`                                   | Which non-human GitHub author classes to minimize for PR comments and review summaries: `all`, `bots`, `users`, or `none`; humans are never minimized       |
| `watch.readyDelayMinutes`            | `10`                                      | Settle window after READY before the monitor loop cancels                                                                                                   |
| `resolve.shaPoll.intervalMs`         | `2000`                                    | Poll interval when waiting for `--require-sha` to land on GitHub                                                                                            |
| `resolve.shaPoll.maxAttempts`        | `10`                                      | Max `--require-sha` polls before giving up                                                                                                                  |
| `checks.ciTriggerEvents`             | `["pull_request", "pull_request_target"]` | Workflow `on:` events treated as PR CI (add `merge_group` for merge-queue repos)                                                                            |
| `mergeStatus.blockingReviewerLogins` | `["copilot"]`                             | Reviewer logins whose pending review or outstanding review request blocks `mark_ready`                                                                      |
| `actions.autoResolveOutdated`        | `true`                                    | Deprecated compatibility setting; outdated threads are surfaced before human-authored threads are replied to and bot/non-human threads are resolved         |
| `actions.autoMinimizeSuppressed`     | `true`                                    | Silently resolve/minimize classification-rule matches with both `suppress: true` and `autoResolve: true` before emitting `fix_code`                         |
| `actions.autoMarkReady`              | `true`                                    | Emit `mark_ready` when a draft PR reaches a clean handoff state                                                                                             |
| `actions.commitSuggestions`          | `true`                                    | Route `/pr-shepherd:resolve` through `commit-suggestion` (singular) for threads with a ` ```suggestion ` block                                              |
| `actions.neverCancelRuns`            | `[]`                                      | Case-insensitive glob patterns for workflow/check names whose GitHub Actions workflow runs Shepherd must never cancel                                       |

## `botUsernames`

Top-level list of GitHub logins that Shepherd treats as bot authors in addition to GitHub-detected bots (`authorType: Bot`) and logins containing `[bot]`.

Configured bot threads are returned on every tick until resolved, even if their transcript is unchanged and already seen. Configured bot comments and reviews also follow bot minimization/routing policy when eligible. Human-authored active threads remain marker-gated so Shepherd does not repeatedly return unresolved human comments it cannot resolve automatically.

Matching is case-insensitive and treats a trailing `[bot]` suffix as equivalent to the bare login.

## `ignoreChecks`

Top-level list of case-insensitive glob patterns for GitHub check/status context names Shepherd should ignore completely. Ignored checks are removed before CI classification, so they do not affect readiness, summaries, triage, stall detection, JSON output, or text output.

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

Maximum number of times shepherd dispatches the `fix_code` action for the same surfaced review thread body without it being resolved or changed. Once a thread body hits this count, shepherd escalates to the `escalate` action instead of retrying.

The counter is keyed by the thread transcript hash. If the author edits or replies in the thread, the hash changes and the per-thread counter resets. Threads suppressed by seen markers do not increment this counter.

- **Raise** for complex threads that may require multiple fix-push-review cycles.
- **Lower** if you want to escalate to human review sooner.

### `iterate.stallTimeoutMinutes` — default `60`

Maximum number of minutes the monitor loop will repeat the same action without material progress before escalating with the `stall-timeout` trigger. "Material progress" means any change to: HEAD SHA, the set of failing check names, actionable thread/comment/review IDs, or the review-summary minimize bucket.

The same timeout also applies to CI that has not started: relevant queued/requested/waiting check runs, or pending external status contexts, escalate when their latest source activity time is older than this threshold and no start timestamp exists. For check runs, Shepherd uses `updatedAtUnix` when GitHub exposes it and falls back to `createdAtUnix`.

The stall timer resets automatically whenever the fingerprint changes (new commit, resolved thread, different CI failure, etc.).

Override per-invocation with `--stall-timeout <duration>` (e.g. `--stall-timeout 1h`, `--stall-timeout 0` to disable).

- **Raise** for workflows where CI can legitimately take longer than 60 minutes without any state change.
- **Lower** if you want faster escalation when a PR gets stuck.
- **Set to `0`** to disable stall detection entirely.

### `iterate.minimizeApprovals` — default `false`

**Breaking change from `iterate.minimizeReviewSummaries.{bots, humans, approvals}`** — the old nested keys are no longer recognized.

Non-human `COMMENTED` review summaries can be minimized by the `iterate` loop. Human-authored summaries are surfaced through seen markers and are never minimized. Review summary IDs ride along inside the existing resolve command — no code change needed to minimize them. Rendered under `## Review IDs to minimize queue` in the iterate markdown output.
`iterate.minimizeComments` controls which authors are eligible for that minimization.

Opt in to also minimize `APPROVED`-state reviews (`pr approve` clicks with or without a body). Off by default because approvals are an affirmative signal you usually want to keep visible. Flip to `true` for long-running PRs where stale approvals pile up. When enabled, `iterate.minimizeComments` still filters which approval authors are minimized; approvals excluded by that policy are surfaced instead.

When `false` (default), approval reviews are surfaced under `## Approvals (surfaced — not minimized)` only in iterate output that is already being emitted for other actionable work (for example, alongside a `fix_code` payload). They remain visible and are not passed to `--minimize-comment-ids`, but approvals by themselves do not cause iterate to emit that section instead of returning `wait`.

> Perf note: when this is `false` (default), `fetchPrBatch` does not paginate beyond the first 50 approved reviews. Turn it on to fetch all approvals.

### `iterate.minimizeComments` — default `"all"`

Controls which non-human GitHub-classified author types are passed to `--minimize-comment-ids` for minimizable PR comments, `COMMENTED` review summaries, and approval reviews when `iterate.minimizeApprovals` is enabled. A human author is `authorType: User` with no `[bot]` in the login; human-authored items are never minimized.

- `"all"` minimizes Bot and Unknown authors.
- `"bots"` minimizes only GitHub `Bot` authors.
- `"users"` is retained for compatibility but does not minimize human authors.
- `"none"` surfaces minimizable comments/reviews but does not auto-minimize them.

Items excluded by this policy still go through seen markers: Shepherd surfaces them the first time it sees them, writes a body hash marker, suppresses unchanged repeats on later ticks, and re-surfaces them if the author edits the body in place.

---

## `watch`

### `watch.readyDelayMinutes` — default `10`

After the PR first reaches READY status (all checks green, no open threads), shepherd continues to loop for this many minutes before cancelling the loop. This settle window gives reviewers time to request changes or for a Copilot review to finish.

The ready-delay countdown resets if the PR drops out of READY state at any tick.

---

## `resolve`

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

These flags control whether shepherd automatically performs each class of mutation during an `iterate` tick. Some actions also have `--no-auto-*` CLI flags for per-invocation overrides.

### `actions.autoResolveOutdated` — default `true`

Deprecated. Shepherd no longer auto-resolves outdated threads. Outdated threads are surfaced as `[status: outdated]`, marker-gated, and human-authored threads are replied to through `--reply-thread-ids` when the resolve command runs.

### `actions.autoMinimizeSuppressed` — default `true`

When `true`, Shepherd silently applies the resolve/minimize mutation for classification-rule matches that set both `suppress: true` and `autoResolve: true`, then removes successful IDs from the agent-facing queues before `iterate` decides whether to emit `fix_code`.

This applies only to explicit classification-rule auto-resolve matches. Ordinary `iterate.minimizeComments` policy queues and `autoResolve: true` rules without `suppress: true` still flow through the generated resolve command.

### `actions.autoMarkReady` — default `true`

When `true`, shepherd converts a draft PR to ready-for-review once all checks pass, no Shepherd-visible work remains, no configured blocking review is in progress, and the ready-delay has not yet elapsed. After the ready-delay elapses, the loop emits `cancel` instead.

Disable if your team uses the draft state as a deliberate gate that requires a human to promote.

### `actions.commitSuggestions` — default `true`

When `true`, `fix_code` instructions prefer applying reviewer-authored ` ```suggestion ` blocks via [`pr-shepherd commit-suggestion`](cli-usage.md#pr-shepherd-commit-suggestion-pr---thread-id-id---message) (singular, one per thread) — creating a local commit per suggestion that co-credits the reviewer — rather than having the agent re-type the fix. Each actionable thread with a parsed suggestion is annotated in the iterate payload.

Disable if you want the agent to read and re-implement every suggestion (e.g. because your team prefers all commits to come from a single author, or because you want an extra human-ish review pass over every change). Flipping this to `false` still surfaces `suggestion` blocks in the iterate payload so the agent has the reviewer's exact proposal available as context; the skill just falls through to its manual-edit path.

### `actions.neverCancelRuns` — default `[]`

Case-insensitive glob patterns for GitHub Actions workflow/check names that Shepherd must not cancel. Cancellation is workflow-run scoped in GitHub, so a match on any check/job in a run protects the entire run ID from automatic cancellation and from `## In-progress runs` prompts.

Use this for workflows where sibling jobs should be allowed to finish even after one job fails:

```yaml
actions:
  neverCancelRuns:
    - "Final Code Review"
```

Protected runs still count as failing or in-progress checks. Shepherd surfaces them under `## Protected runs` in text output and `fix.protectedRuns` in JSON so the agent knows they were deliberately left running.

Protection also takes precedence over `ignoreChecks` for GitHub Actions check runs from the same workflow/run: a protected check is kept visible and can block ready-delay even if its raw job name matches `ignoreChecks`.

---

## Environment variables

| Variable                                                     | Effect                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PR_SHEPHERD_STATE_DIR`                                      | Override the loop-state base directory (default `$TMPDIR/pr-shepherd-state`)                                                                      |
| `GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub auth token. Resolution order: `GH_TOKEN` → `GITHUB_TOKEN` → `gh auth token` fallback (requires `gh` CLI) → `GITHUB_PERSONAL_ACCESS_TOKEN`. |
