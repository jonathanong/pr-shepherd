export const TOP_USAGE = `pr-shepherd

Autonomous PR CI monitor and review-comment resolver for agentic coding tools.

Usage:
  pr-shepherd --version | -v
  pr-shepherd --help | -h
  pr-shepherd [PR] [poll-flags] [iterate-flags]
  pr-shepherd iterate [PR] [iterate-flags]
  pr-shepherd apply review [PR] [review-flags]
  pr-shepherd apply files [PR] [files...] [--tests] [--match REGEX]
  pr-shepherd apply journal [PR] <item> [--dry-run] [--format text|json]
  pr-shepherd build-suggestion-patches [PR] --thread-id ID --message MSG [groups...]
  pr-shepherd admin clean <pr|branch|current|repo|all> [value] [flags]
  pr-shepherd admin log-file [--format text|json]

Commands:
  [PR]                 Poll until non-WAIT or timeout. This is the default command.
  iterate              Run one iterate tick (single-tick alias).
  apply review         Apply review-state mutations after fixes.
  apply files          Mark changed files as viewed in GitHub.
  apply journal        Append a list item to the Shepherd Journal details block of a PR body.
  build-suggestion-patches
                       Convert ordered GitHub suggestion threads into patches and commit instructions.
  admin clean          Remove pr-shepherd state files.
  admin log-file       Print the per-worktree debug log path.

PR argument:
  PR may be a number such as 42 or a GitHub pull request URL.
  When omitted, pr-shepherd infers the current branch's pull request.

Common flags:
  --format text|json   Output Markdown text or JSON. Default: text.
  --verbose            Include verbose iterate fields and detailed poll-tick lines.
  --help, -h           Print help and exit before any GitHub, git, config, or log I/O.

Iterate flags:
  --ready-delay <duration>       Settle window before a clean PR cancels. Bare number = minutes. Example: 15m.
  --stall-timeout <duration>     Escalate repeated unchanged failures after this duration. Bare number = minutes. 0 disables.
  --no-auto-mark-ready           Do not convert draft PRs to ready for review.
  --no-auto-cancel-actionable    Legacy no-op; workflow runs are never cancelled.

Polling flags:
  --interval <duration>          Delay between WAIT ticks. Bare number = seconds. Default: 60s.
  --timeout <duration>           Poll wall-clock cap for WAIT ticks. Bare number = seconds. Default: 4.5m.
  --debounce <duration>          Settle window after first FIX_CODE before returning. Bare number = seconds. Default: 60s. 0 disables.
  --quiet-status                 During WAIT polling, print only changed status snapshots.
  --until-terminal               Continue through WAIT/MARK_READY until FIX_CODE/CANCEL/ESCALATE.

Clean variants:
  pr [number]          Remove state for one PR. Defaults to current branch PR.
  branch [name]        Remove state for a branch's PR. Defaults to current branch.
  current              Alias for branch against the current branch.
  repo                 Remove all state for the current repository.
  all                  Remove all pr-shepherd state.

Exit codes: 0 done, 10-19 PR state, 64-78 shepherd failed (sysexits.h).
  0   CANCEL (merged or ready-delay elapsed)
  10  WAIT
  11  MARK_READY
  12  FIX_CODE
  13  ESCALATE
  14  CANCEL (closed without merging)
See docs/exit-codes.md for the full sysexits.h error-code table.

Duration examples: 30s, 4.5m, 1h. A bare number uses each flag's default unit (see above); decimals are allowed with an explicit unit (4.5m).

Run 'pr-shepherd <command> --help' for command-specific details.`;
