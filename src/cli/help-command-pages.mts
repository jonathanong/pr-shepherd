export const COMMAND_USAGE = {
  resolve: `pr-shepherd resolve

Apply GitHub review-state mutations after fixes.

Usage:
  pr-shepherd resolve [PR] --reply-thread-ids A,B --message MSG
  pr-shepherd resolve [PR] --resolve-thread-ids A,B [--minimize-comment-ids X,Y]
                            [--dismiss-review-ids Q] [--message MSG]
                            [--require-sha SHA] [--format text|json]

Flags:
  --resolve-thread-ids <ids>      Comma-separated review thread IDs (PRRT_*) to resolve.
                                  Human-authored thread IDs are skipped; use --reply-thread-ids.
                                  Note: comment IDs (PRRC_*) from gh api are not thread IDs and will fail.
  --reply-thread-ids <ids>        Comma-separated human review thread IDs to reply to.
  --minimize-comment-ids <ids>    Comma-separated issue/review comment IDs to minimize.
  --dismiss-review-ids <ids>      Comma-separated CHANGES_REQUESTED review IDs to dismiss.
  --message <text>                Reply/dismiss message. Required with --reply-thread-ids
                                  or --dismiss-review-ids.
  --require-sha <sha>             Wait until GitHub reports this PR head SHA before mutating.
                                  Must be a full 40-character hex SHA. Use $(git rev-parse HEAD).
  --format text|json              Output format. Default: text.
  --help, -h                      Print this help and exit before GitHub I/O.

At least one non-empty action flag is required:
  --reply-thread-ids, --resolve-thread-ids, --minimize-comment-ids, or --dismiss-review-ids.

PR may be a number or GitHub pull request URL. When omitted, the current branch PR is inferred.
Exit code: 0 on success; 1 on validation, lookup, or mutation failure.`,

  "commit-suggestion": `pr-shepherd commit-suggestion

Build a patch and commit instructions for one GitHub review thread containing a suggestion block.
The command does not edit files or mutate git history.

Usage:
  pr-shepherd commit-suggestion [PR] --thread-id ID --message MSG
                                      [--description DESC] [--format text|json]

Flags:
  --thread-id <id>       Review thread ID containing exactly one suggestion to apply. Required.
  --message <text>       Suggested commit subject. Required and must be non-empty.
  --description <text>   Optional longer commit body.
  --format text|json     Output format. Default: text.
  --help, -h             Print this help and exit before GitHub, git, config, or log I/O.

Preconditions:
  The current branch must match the PR head ref, and local HEAD must match the PR head SHA.

Exit codes:
  0  suggestion patch and instructions produced
  1  validation, lookup, precondition, or suggestion parsing failure`,

  "mark-files-as-viewed": `pr-shepherd mark-files-as-viewed

Mark changed files as viewed in the GitHub pull request diff.

Usage:
  pr-shepherd mark-files-as-viewed [PR] [files...] [--tests] [--match REGEX]
                                      [--format text|json]

Selectors:
  files...          Exact changed-file paths from the PR diff.
  --tests           Select changed test files.
  --match <regex>   Select changed files whose paths match a case-insensitive JavaScript regex.
                    May be repeated.

Flags:
  --format text|json  Output format. Default: text.
  --help, -h          Print this help and exit before GitHub I/O.

PR may be a number or GitHub pull request URL. When omitted, the current branch PR is inferred.
Exit code: 0 on success; 1 on validation or lookup failure.`,

  iterate: `pr-shepherd iterate

Run one iterate tick for a pull request. The no-subcommand form polls; use this subcommand for a single tick.
The output contains one action and an action-specific ## Instructions section.

Usage:
  pr-shepherd iterate [PR] [iterate-flags]

Iterate flags:
  --ready-delay <duration>       Settle window before a clean PR cancels. Example: 15m.
  --stall-timeout <duration>     Escalate repeated unchanged failures after this duration.
  --no-auto-mark-ready           Do not convert draft PRs to ready for review.
  --no-auto-cancel-actionable    Do not cancel in-progress runs before actionable fixes.
  --format text|json             Output Markdown text or JSON. Default: text.
  --verbose                      Include verbose iterate fields.
  --help, -h                     Print this help and exit before GitHub, git, config, or log I/O.

Actions:
  WAIT        No immediate code action; recheck later or use pr-shepherd poll.
  MARK_READY  Draft PR was marked ready for review.
  FIX_CODE    Apply fixes, commit, push, and run the printed resolve command.
  CANCEL      Terminal state: merged/closed or ready-delay elapsed.
  ESCALATE    Terminal state requiring human direction.

Exit codes:
  0  WAIT or MARK_READY
  1  FIX_CODE, or a command/validation error
  2  CANCEL
  3  ESCALATE`,

  poll: `pr-shepherd poll

Run iterate repeatedly while the action is WAIT. Print only the final tick to stdout.
Poll exits as soon as iterate returns MARK_READY, FIX_CODE, CANCEL, or ESCALATE, or when timeout
returns the last WAIT result.

Usage:
  pr-shepherd poll [PR] [poll-flags] [iterate-flags]

Poll flags:
  --interval <duration>          Sleep between WAIT ticks. Default: 30s.
  --timeout <duration>           Maximum wall-clock wait. Default: 5m.

Forwarded iterate flags:
  --ready-delay <duration>       Settle window before a clean PR cancels. Example: 15m.
  --stall-timeout <duration>     Escalate repeated unchanged failures after this duration.
  --no-auto-mark-ready           Do not convert draft PRs to ready for review.
  --no-auto-cancel-actionable    Do not cancel in-progress runs before actionable fixes.
  --format text|json             Output Markdown text or JSON. Default: text.
  --verbose                      Include verbose iterate fields and detailed per-tick lines.
  --help, -h                     Print this help and exit before GitHub, git, config, or log I/O.

Durations accept seconds, minutes, or hours: 30s, 2m, 1h, or bare seconds.
Each WAIT tick writes a single dot to stderr; --verbose emits the detailed per-tick line.

Exit codes:
  0  WAIT timeout or MARK_READY
  1  FIX_CODE, or a command/validation error
  2  CANCEL
  3  ESCALATE`,

  clean: `pr-shepherd clean

Remove pr-shepherd state files from PR_SHEPHERD_STATE_DIR.

Usage:
  pr-shepherd clean pr [number] [--dry-run] [--format text|json]
  pr-shepherd clean branch [name] [--dry-run] [--format text|json]
  pr-shepherd clean current [--dry-run] [--format text|json]
  pr-shepherd clean repo [--dry-run] [--format text|json]
  pr-shepherd clean all [--dry-run] [--format text|json]

Variants:
  pr [number]          Remove state for one PR. Defaults to current branch PR.
  branch [name]        Resolve a branch to its open PR, then remove that PR's state.
                       Defaults to current branch.
  current              Alias for branch against the current branch.
  repo                 Remove all state for the current repository, including worktree logs.
  all                  Remove all pr-shepherd state.

Flags:
  --dry-run            Preview paths without removing them.
  --format text|json   Output format. Default: text.
  --help, -h           Print this help and exit before any cleanup.

Exit code: 0 on success; 1 on validation or cleanup failure.`,

  "log-file": `pr-shepherd log-file

Print the per-worktree append-only debug log path for the current repository.
The log is created by the first non-help pr-shepherd command that initializes logging.

Usage:
  pr-shepherd log-file [--format text|json]

Flags:
  --format text|json   Print a raw path or {"path": "..."} JSON. Default: text.
  --help, -h           Print this help and exit before logging setup.

Environment:
  PR_SHEPHERD_LOG_DISABLED=1 disables logging.
  PR_SHEPHERD_STATE_DIR overrides the base state directory.

Exit code: 0 on success; 1 if repository identity cannot be resolved.`,
} as const;
