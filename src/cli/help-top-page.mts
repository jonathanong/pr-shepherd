export const TOP_USAGE = `pr-shepherd

Autonomous PR CI monitor and review-comment resolver for agentic coding tools.

Usage:
  pr-shepherd --version | -v
  pr-shepherd --help | -h
  pr-shepherd [PR] [poll-flags] [iterate-flags]
  pr-shepherd iterate [PR] [iterate-flags]
  pr-shepherd poll [PR] [poll-flags] [iterate-flags]
  pr-shepherd resolve [PR] [resolve-flags]
  pr-shepherd commit-suggestion [PR] --thread-id ID --message MSG [flags]
  pr-shepherd mark-files-as-viewed [PR] [files...] [--tests] [--match REGEX]
  pr-shepherd journal [PR] <item> [--dry-run] [--format text|json]
  pr-shepherd clean <pr|branch|current|repo|all> [value] [flags]
  pr-shepherd log-file [--format text|json]

Commands:
  [PR]                 Poll until non-WAIT or timeout. This is the default command.
  iterate              Run one iterate tick (single-tick alias).
  poll                 Re-run iterate while the action is WAIT, then print the final tick.
  resolve              Apply review-state mutations (requires at least one action flag).
  commit-suggestion    Convert one GitHub suggestion thread into a patch and commit instructions.
  mark-files-as-viewed Mark PR changed files as viewed in GitHub.
  journal              Append a list item to the ## Shepherd Journal section of a PR body.
  clean                Remove pr-shepherd state files.
  log-file             Print the per-worktree debug log path.

PR argument:
  PR may be a number such as 42 or a GitHub pull request URL.
  When omitted, pr-shepherd infers the current branch's pull request.

Common flags:
  --format text|json   Output Markdown text or JSON. Default: text.
  --verbose            Include verbose iterate fields and detailed poll-tick lines.
  --help, -h           Print help and exit before any GitHub, git, config, or log I/O.

Iterate flags:
  --ready-delay <duration>       Settle window before a clean PR cancels. Example: 15m.
  --stall-timeout <duration>     Escalate repeated unchanged failures after this duration.
  --no-auto-mark-ready           Do not convert draft PRs to ready for review.
  --no-auto-cancel-actionable    Do not cancel in-progress runs before actionable fixes.

Poll flags:
  --interval <duration>          Delay between WAIT ticks. Default: 60s.
  --timeout <duration>           Poll wall-clock cap. Default: 4.5m.
  --quiet-status                 During WAIT polling, print only changed status snapshots.

Clean variants:
  pr [number]          Remove state for one PR. Defaults to current branch PR.
  branch [name]        Remove state for a branch's PR. Defaults to current branch.
  current              Alias for branch against the current branch.
  repo                 Remove all state for the current repository.
  all                  Remove all pr-shepherd state.

Exit codes for iterate and poll:
  0  WAIT or MARK_READY
  1  FIX_CODE, or a command/validation error
  2  CANCEL
  3  ESCALATE

Duration examples: 30s, 4.5m, 1h, or bare seconds.

Run 'pr-shepherd <command> --help' for command-specific details.`;
