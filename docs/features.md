# pr-shepherd feature matrix

## Features this module supports

The module supports a focused automation loop for PR monitoring and deterministic GitHub comment/review maintenance.

### CLI commands and invocation

- Supports default invocation `pr-shepherd [PR]` for one iterate tick.
- Supports explicit `pr-shepherd iterate [PR]` as the legacy alias spelling.
- Supports `pr-shepherd resolve [PR]` fetch mode (via `--fetch` or when no mutation flags are passed).
- Supports `pr-shepherd resolve [PR]` mutate mode with `--resolve-thread-ids`, `--minimize-comment-ids`, `--dismiss-review-ids`.
- Supports `pr-shepherd commit-suggestion [PR] --thread-id <id> --message "<one-sentence headline>"` (or `--description`) for suggestion-thread patch generation.
- Supports `pr-shepherd log-file` to print the per-worktree debug log path.
- Supports `--version`/`-v`.
- Supports `--format text|json`, and `--verbose` output mode (iterate only).
- Supports `--ready-delay`, `--stall-timeout`, `--no-auto-mark-ready`, `--no-auto-cancel-actionable`.

### Supported iterate outputs and actions

- Performs one deterministic action per tick: `WAIT`, `MARK_READY`, `CANCEL`, `ESCALATE`, or `FIX_CODE`.
- Supports `WAIT` when checks and review state have no immediate code-action needed.
- Supports `MARK_READY` for draft PRs when clean handoff conditions are met.
- Supports `CANCEL` on merged/closed PRs and ready-delay completion.
- Supports `ESCALATE` when repeat-stall or repeated failed fix attempts occur.
- Supports `FIX_CODE` when inline threads, summary-minimization needs, review-requested changes, conflicts, or failing checks are present.
- Produces both markdown and JSON output, with corresponding fields kept in sync by output design.

### Merge-status and readiness handling

- Reads branch-mergeability state (`CLEAN`, `BEHIND`, `CONFLICTS`, `BLOCKED`, `UNSTABLE`, `DRAFT`, `UNKNOWN`) in-loop.
- Supports ready-delay state machine tracking and cancellation after the delay window on clean handoff.
- Supports a fresh mergeability re-check path before final ready-delay cancellation.
- Supports optional `mark_ready` automation for eligible draft PRs.

### CI checking and triage

- Fetches and classifies checks from GitHub check runs and workflow runs.
- Supports configurable PR-related trigger filtering via `checks.ciTriggerEvents`.
- Supports triage for action failures (`FAILURE`, `TIMED_OUT`, etc.), `CANCELLED`, and `STARTUP_FAILURE`.
- Supports supplemental REST fetch for startup-failure workflow runs tied to the PR head SHA.
- Supports external status checks surfaced via details URL when a run ID is unavailable.
- Supports cancelling stale failing in-progress runs before code fixes are attempted.

### Review, comments, and summaries

- Fetches and surfaces active inline review threads.
- Fetches and surfaces top-level PR comments.
- Fetches and surfaces `COMMENTED` review summaries.
- Fetches and surfaces `APPROVED` reviews.
- Supports auto-resolve of outdated review threads (configurable).
- Supports first-look tracking for outdated/resolved/minimized items with edit-aware resurface behavior.
- Supports review-summary minimization through the same comment minimization pipeline.
- Supports resolving comment threads after fixes using the generated resolve command.
- Supports minimizing PR-level comments and review summaries when eligible by `iterate.minimizeComments`.
- Supports keeping `APPROVED` reviews surfaced by default and optionally minimizing them when configured.

### Mutation behavior

- Supports resolving review threads by ID (`--resolve-thread-ids`).
- Supports minimizing minimizable objects by ID (`--minimize-comment-ids`), including review summaries/review IDs.
- Supports dismissing `CHANGES_REQUESTED` reviews with a message (`--dismiss-review-ids` + `--message`).
- Supports batching mutation IDs in groups of 10.
- Supports explicit `--require-sha <sha>` polling before mutating so close/reopen actions follow the pushed commit.

### Suggestion-thread workflow

- Parses suggestion fences in review thread bodies.
- Supports generating unified diffs and suggested commit metadata for one suggestion thread at a time.
- Supports manual fallback when suggestion patch application fails (line-range replacement instructions).
- Does not directly edit the working tree in this command; outputs explicit patch/apply instructions.

### Configuration and environment

- Supports `.pr-shepherdrc.yml` with documented keys for iterate behavior, checks, merge status, resolve, and actions.
- Supports auth discovery via `GH_TOKEN`, `GITHUB_TOKEN`, and `gh auth token` fallback, then `GITHUB_PERSONAL_ACCESS_TOKEN`.
- Supports per-worktree/run state directory override via `PR_SHEPHERD_STATE_DIR`.
- Supports log capture with `PR_SHEPHERD_LOG_DISABLED=1`.

### Safety, rate limits, and diagnostics

- Preserves lean output semantics by omitting default/no-op fields.
- Supports structured JSON for machine-readable consumption.
- Exposes per-run/per-command logging output for diagnosis and reproducibility.
- Supports explicit instruction projection for both manual and agent execution paths.

## Features this module does not support

- Does not run as a long-running daemon; `poll` is a bounded command and must be re-invoked for continued iteration after actionable output.
- Does not merge PRs or merge branches itself.
- Does not continuously rebase branches outside required conflict-resolution scenarios.
- Does not modify files or apply suggestion patches to the working tree automatically; it only emits what to run.
- Does not guarantee CI rerun-versus-code-fix decisions; it surfaces failures and delegates action choice to the caller.
- Does not auto-reply to inline comments when resolving threads.
- Does not auto-classify every surfaced thread/comment as `actionable` vs `informational`; it exposes raw structured triage data.
- Does not automatically apply edits for threads without line/locatable references.
- Does not minimize already-hidden/sticky comment content beyond existing CLI mutation paths.
- Does not support hidden unknown/unsupported subcommands; unknown input returns usage and non-zero exit.
- Does not support unknown GitHub API domains without explicit `rest()` exceptions documented by implementation constraints.

## References

- Command surface and argument parsing: [src/cli-parser.mts](src/cli-parser.mts)
- CLI usage reference: [docs/cli-usage.md](docs/cli-usage.md)
- Action model and flow: [docs/actions.md](docs/actions.md), [docs/iterate-flow.md](docs/iterate-flow.md)
- Configuration options: [docs/configuration.md](docs/configuration.md)
- Comments/thread/summaries behavior: [docs/comments.md](docs/comments.md)
