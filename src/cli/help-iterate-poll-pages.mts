export const ITERATE_USAGE = `pr-shepherd iterate

Run one iterate tick for a pull request. The no-subcommand form polls; use this subcommand for a single tick.
The output contains one action and an action-specific ## Instructions section.

Usage:
  pr-shepherd iterate [PR] [iterate-flags]

Iterate flags:
  --ready-delay <duration>       Settle window before a clean PR cancels. Bare number = minutes. Example: 15m.
  --stall-timeout <duration>     Escalate repeated unchanged failures after this duration. Bare number = minutes. 0 disables.
  --no-auto-mark-ready           Do not convert draft PRs to ready for review.
  --no-auto-cancel-actionable    Do not cancel in-progress runs before actionable fixes.
  --format text|json             Output Markdown text or JSON. Default: text.
  --verbose                      Include verbose iterate fields.
  --help, -h                     Print this help and exit before GitHub, git, config, or log I/O.

Durations accept s/m/h suffixes: 30s, 4.5m, 1h. A bare number is minutes; decimals are allowed only with an explicit unit (4.5m).

Actions:
  WAIT        No immediate action; continue with the next poll.
  MARK_READY  Draft PR was marked ready; continue with the next poll.
  FIX_CODE    Agent action is required; follow the instructions, then continue polling.
  CANCEL      Stop polling: merged/closed or ready-delay elapsed.
  ESCALATE    Stop polling until a human provides direction.

Exit codes:
  0   CANCEL (merged or ready-delay elapsed)
  10  WAIT
  11  MARK_READY
  12  FIX_CODE
  13  ESCALATE
  14  CANCEL (closed without merging)
  A command/validation/GitHub failure exits with a sysexits.h code instead (see docs/exit-codes.md).`;

export const POLL_USAGE = `pr-shepherd poll

Run iterate repeatedly for WAIT ticks and during the FIX_CODE debounce window. Print only the
final tick to stdout.
Poll exits as soon as iterate returns MARK_READY, CANCEL, or ESCALATE, or when timeout
returns the last WAIT result. FIX_CODE starts a --debounce settle window (default 1m): poll keeps
iterating at --interval, then runs one more tick after the window and returns that result.
With --until-terminal, poll also continues through MARK_READY.

Usage:
  pr-shepherd poll [PR] [poll-flags] [iterate-flags]

Poll flags:
  --interval <duration>          Sleep between WAIT ticks. Bare number = seconds. Default: 60s.
  --timeout <duration>           Maximum wall-clock wait for WAIT ticks. Bare number = seconds. Default: 4.5m.
  --debounce <duration>          Settle window after first FIX_CODE before returning. Bare number = seconds. Default: 60s. 0 disables.
  --quiet-status                 During WAIT polling, print only changed status snapshots.
  --until-terminal               Continue through WAIT/MARK_READY until FIX_CODE/CANCEL/ESCALATE.

Forwarded iterate flags:
  --ready-delay <duration>       Settle window before a clean PR cancels. Bare number = minutes. Example: 15m.
  --stall-timeout <duration>     Escalate repeated unchanged failures after this duration. Bare number = minutes. 0 disables.
  --no-auto-mark-ready           Do not convert draft PRs to ready for review.
  --no-auto-cancel-actionable    Do not cancel in-progress runs before actionable fixes.
  --format text|json             Output Markdown text or JSON. Default: text.
  --verbose                      Include verbose iterate fields and detailed per-tick lines.
  --help, -h                     Print this help and exit before GitHub, git, config, or log I/O.

Durations accept s/m/h suffixes: 30s, 4.5m, 1h. A bare number uses each flag's default unit (seconds
for --interval/--timeout/--debounce, minutes for --ready-delay/--stall-timeout); decimals are allowed only with
an explicit unit (4.5m).
Each WAIT tick writes an explicit still-running line to stderr by default; --quiet-status prints only changed WAIT snapshots, and --verbose emits detailed per-tick lines.
FIX_CODE debounce writes a remaining-seconds line to stderr. --timeout does not cut an in-flight debounce short.
With --until-terminal, --timeout is ignored for WAIT ticks and polling continues until FIX_CODE, CANCEL, or ESCALATE.

Exit codes: same as iterate (the final tick's action/reason decides the code).
  0   CANCEL (merged or ready-delay elapsed)
  10  WAIT (including a WAIT returned by --timeout)
  11  MARK_READY
  12  FIX_CODE
  13  ESCALATE
  14  CANCEL (closed without merging)
  A command/validation/GitHub failure exits with a sysexits.h code instead (see docs/exit-codes.md).`;

/** Public help page for the default PR polling invocation. */
export const DEFAULT_USAGE = POLL_USAGE.replaceAll("pr-shepherd poll", "pr-shepherd [PR]");
