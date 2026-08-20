# pr-shepherd feature matrix

Shepherd does two jobs: **gather all context for a PR**, then **emit one deterministic action** for the calling agent.

## Context gathered

- One GraphQL batch per tick for PR state, branch rules, merge queue/stacks, threads, comments, reviews, and check runs. Extra pages use a slim `batch-pr-page.gql` follow-up, not another full snapshot. REST supplements: job logs, mergeability fallback, and startup-failure runs only when CheckSuites are missing or truncated. See [graphql.md](graphql.md) and [context.md](context.md).
- Surfaces inline review threads (full transcript), top-level PR comments, `COMMENTED` summaries, `APPROVED` reviews, and `CHANGES_REQUESTED` reviews. See [comments.md](comments.md).
- Surfaces GitHub's raw `authorAssociation` and Shepherd `authorType` without deriving a trust label.
- First-look tracking for outdated/resolved/minimized items; edited bodies re-surface. Poll debounce ticks do not persist seen markers until the post-window tick.
- Classifies checks (passed / failing / in_progress / skipped / filtered / ignored / superseded) with optional `failedStep`, `jobName`, and a bounded log excerpt. Excerpts are omitted for `CANCELLED` and `STARTUP_FAILURE`. See [checks.md](checks.md).
- Reads mergeability (`CLEAN`, `BEHIND`, `CONFLICTS`, `BLOCKED`, `UNSTABLE`, `DRAFT`, `UNKNOWN`) and prints merge requirements (approvals, conversation resolution, and extra rules only when they apply). Do not infer “must wait for an approval” from `reviewDecision`. See [merge-status.md](merge-status.md).
- `BEHIND` is status information, not a rebase.

## Actions emitted

- Exactly one action per tick: `WAIT`, `MARK_READY`, `CANCEL`, `ESCALATE`, or `FIX_CODE`. See [actions.md](actions.md) and [iterate-flow.md](iterate-flow.md).
- Local stdio MCP tools: `iterate`, `apply`, and `build_suggestion_patch`. Shell: `pr-shepherd [PR]` (bounded poll) and `pr-shepherd iterate [PR]` (one tick). See [mcp.md](mcp.md) and [cli-usage.md](cli-usage.md).
- Poll `--debounce` (default 1m) so `FIX_CODE` waits a settle window, still iterating at `--interval`, then returns one batched tick. MCP `iterate` has no debounce.
- `--format text|json`, `--verbose` (poll and iterate), `--version`/`-v`, `--ready-delay`, `--stall-timeout`, `--no-auto-mark-ready`, `--no-auto-cancel-actionable`.
- Ordered `apply` operations: review mutations (reply/resolve/minimize/dismiss, batched in groups of 10), mark files viewed, append journal (`--file` / `--file -`). `requireSha` polls until HEAD is visible.
- `build_suggestion_patch` emits a unified diff plus commit metadata for one suggestion thread. It does not write a patch file or mutate git.
- Auto-cancels stale failing GitHub Actions runs on `FIX_CODE` (REST cancel; protect with `actions.neverCancelRuns`; disable with `--no-auto-cancel-actionable`). `FIX_CODE` instructions also list remaining in-progress run IDs for the agent to cancel before a push.
- Optional `mark_ready` for eligible draft PRs. Ready-delay then `CANCEL` on a clean handoff.
- Process exit codes `0` / `10`–`14` for PR-state actions; `64`–`78` for command/GitHub failures. See [exit-codes.md](exit-codes.md).

## Configuration

- `.pr-shepherdrc.yml` files cascade (cwd up to `$HOME`, including a user-level `$HOME/.pr-shepherdrc.yml`); closer files override farther ones. See [configuration.md](configuration.md).
- Classification rules under `.pr-shepherd/classification/` (`pr-shepherd/classify` types).
- Auth via `GH_TOKEN`, `GITHUB_TOKEN`, `gh auth token`, then `GITHUB_PERSONAL_ACCESS_TOKEN`.
- `PR_SHEPHERD_STATE_DIR`, `PR_SHEPHERD_LOG_DISABLED=1`, `PR_SHEPHERD_LOG_MAX_BODY`.
- `pr-shepherd admin log-file` prints the per-worktree debug log path.

## Not supported

- Does not run as a long-running daemon; MCP clients call `iterate` again after actionable output, while the shell poll dispatcher remains bounded.
- Does not merge PRs or merge branches itself.
- Does not continuously rebase branches outside required conflict-resolution scenarios. `BEHIND` is reported; the agent updates the branch.
- Does not modify files or apply suggestion patches to the working tree; it only emits what to run.
- Does not guarantee CI rerun-versus-code-fix decisions; it surfaces failures and delegates action choice to the caller.
- Replies to human-authored inline threads instead of resolving or minimizing them.
- Does not auto-classify every surfaced thread/comment as `actionable` vs `informational`; it exposes raw structured triage data.
- Does not automatically apply edits for threads without line/locatable references.
- Does not minimize already-hidden/sticky comment content beyond existing CLI mutation paths. Already-minimized `COMMENTED` reviews are not fetched.
- Does not support hidden unknown/unsupported subcommands; unknown input returns usage and non-zero exit.
- Does not support unknown GitHub API domains without explicit `rest()` exceptions documented by implementation constraints.

## References

- Command surface: [cli-usage.md](cli-usage.md)
- MCP server: [mcp.md](mcp.md)
- Programmatic API: [api.md](api.md)
- Action model: [actions.md](actions.md), [iterate-flow.md](iterate-flow.md)
- Context inventory: [context.md](context.md)
- Configuration: [configuration.md](configuration.md)
- Comments: [comments.md](comments.md)
