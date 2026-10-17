export const ITERATE_USAGE = `pr-shepherd iterate

Run one tick and return without sleeping. The no-subcommand form polls; use this subcommand when the
caller owns the next wake-up. One PR prints one action and an action-specific ## Instructions section.
Several same-repository PRs print one aggregate summary. Unless nothing remains to wait for, the output
carries nextCheck: when to rerun if no GitHub event arrives first.

Usage:
  pr-shepherd iterate [PR ...] [iterate-flags]

Iterate flags:
  --ready-delay <duration>       Settle window before a clean PR cancels. Bare number = minutes. Example: 15m.
  --stall-timeout <duration>     Escalate repeated unchanged failures after this duration. Bare number = minutes. 0 disables.
  --no-auto-mark-ready           Do not convert draft PRs to ready for review.
  --merge                        Shepherd through readiness, then emit a merge or merge-queue command.
  --instructions playbook|inline Render fix_code steps inline every tick (default) or fold the invariant ones into a playbook pointer. Default: iterate.instructions (inline).
  --transport auto|graphql|rest  Select GitHub transport. Default: github.transport (auto).
  --format text|json             Output Markdown text or JSON. Default: text.
  --verbose                      Include verbose iterate fields.
  --help, -h                     Print this help and exit before GitHub, git, config, or log I/O.

Durations accept s/m/h suffixes: 30s, 4.5m, 1h. A bare number is minutes; decimals are allowed only with an explicit unit (4.5m).

Actions:
  WAIT        No immediate action; continue with the next poll.
  MARK_READY  Draft PR was marked ready; continue with the next poll.
  READY       Clean PR is inside the ready-delay. Schedule the rerun for when remainingSeconds elapses. Do not invent unrelated work. Already-owned later work may continue.
  FIX_CODE    Agent action is required; follow the instructions, then continue polling.
  CANCEL      Stop polling this pull request: merged/closed or ready-delay elapsed. Continue remaining work from the original request.
  ESCALATE    Stop polling until a human provides direction.
  MERGE       Run the emitted merge/queue command, then continue monitoring.

Exit codes:
  0   CANCEL (merged or ready-delay elapsed)
  10  WAIT or READY
  11  MARK_READY
  12  FIX_CODE
  13  ESCALATE
  14  CANCEL (closed without merging)
  15  MERGE
  A command/validation/GitHub failure exits with a sysexits.h code instead (see docs/exit-codes.md).`;

/** Public help page for the default PR polling invocation. */
export const DEFAULT_USAGE = `pr-shepherd [PR]

Run iterate repeatedly for one PR, or read compact summaries for an explicit same-repository PR set.
Aggregate mode returns when any row needs work, every row is terminal, or timeout.
When CLAUDE_CODE_REMOTE=true, the command runs one tick like iterate and prints nextCheck instead.
Poll exits as soon as iterate returns READY, MARK_READY, CANCEL, or ESCALATE, or when timeout
returns the last WAIT result. FIX_CODE starts a --debounce settle window (default:
poll.debounceSeconds; built-in 1m): poll keeps
iterating at --interval, then runs one more tick after the window and returns that result.
With --until-terminal or --merge, poll also continues through MARK_READY.

Usage:
  pr-shepherd [PR ...] [poll-flags] [iterate-flags]

Use 'pr-shepherd stack PR' for a native GitHub stack.

Poll flags:
  --interval <duration>          Sleep between WAIT ticks. Bare number = seconds. Default: poll.intervalSeconds (built-in 60s). Stack and multi-PR polls multiply that by poll.stackIntervalFactor (built-in 2) unless this flag is set.
  --timeout <duration>           Maximum wall-clock wait for WAIT ticks. Bare number = seconds. Default: poll.timeoutSeconds (built-in 4.5m).
  --debounce <duration>          Settle window after first FIX_CODE or stack SHEPHERD before returning. Bare number = seconds. Default: poll.debounceSeconds (built-in 60s). 0 disables.
  --quiet-status                 Print only changed WAIT snapshots. Overrides poll.quietStatus.
  --no-quiet-status              Print every WAIT snapshot. Overrides poll.quietStatus.
  --until-terminal               Continue through WAIT/MARK_READY until READY/FIX_CODE/MERGE/CANCEL/ESCALATE or stack SHEPHERD.

Forwarded iterate flags:
  --ready-delay <duration>       Settle window before a clean PR cancels. Bare number = minutes. Example: 15m.
  --stall-timeout <duration>     Escalate repeated unchanged failures after this duration. Bare number = minutes. 0 disables.
  --no-auto-mark-ready           Do not convert draft PRs to ready for review.
  --merge                        Shepherd through readiness, then emit a merge or merge-queue command.
  --instructions playbook|inline Render fix_code steps inline every tick (default) or fold the invariant ones into a playbook pointer. Default: iterate.instructions (inline).
  --transport auto|graphql|rest  Select GitHub transport. Default: github.transport (auto).
  --format text|json             Output Markdown text or JSON. Default: text.
  --verbose                      Include verbose iterate fields and detailed per-tick lines.
  --help, -h                     Print this help and exit before GitHub, git, config, or log I/O.

Durations accept s/m/h suffixes: 30s, 4.5m, 1h. A bare number uses each flag's default unit (seconds
for --interval/--timeout/--debounce, minutes for --ready-delay/--stall-timeout); decimals are allowed only with
an explicit unit (4.5m).
Each WAIT tick writes a stderr line naming what it is waiting on by default; poll.quietStatus can change that default, --quiet-status/--no-quiet-status override it, and --verbose emits detailed per-tick lines.
FIX_CODE debounce writes a remaining-seconds line to stderr. --timeout does not cut an in-flight debounce short.
With --until-terminal, --timeout is ignored for WAIT ticks and polling continues until READY, FIX_CODE, MERGE, CANCEL, or ESCALATE. With --merge, --timeout still bounds WAIT ticks; it only continues through MARK_READY while polling remains within that timeout.

Exit codes: same as iterate (the final tick's action/reason decides the code).
  0   CANCEL (merged or ready-delay elapsed)
  10  WAIT or READY (including a WAIT returned by --timeout)
  11  MARK_READY
  12  FIX_CODE
  13  ESCALATE
  14  CANCEL (closed without merging)
  15  MERGE
  A command/validation/GitHub failure exits with a sysexits.h code instead (see docs/exit-codes.md).`;

/** Public help page for `pr-shepherd stack`. */
export const STACK_USAGE = `pr-shepherd stack

Shepherd every open PR in one PR's native GitHub stack, bottom to top. Each poll reads compact
per-layer summaries and returns when a layer needs work, every layer is terminal, or timeout.
SHEPHERD lists one-PR sessions to run before rerunning this command.
--once, or CLAUDE_CODE_REMOTE=true, runs one aggregate tick and prints nextCheck instead of sleeping.

Usage:
  pr-shepherd stack PR [--once] [poll-flags] [iterate-flags]

Stack flags:
  --once                         Run one aggregate tick without sleeping; poll flags are ignored.

Poll flags:
  --interval <duration>          Sleep between WAIT ticks. Bare number = seconds. Default: poll.intervalSeconds (built-in 60s) multiplied by poll.stackIntervalFactor (built-in 2) unless this flag is set.
  --timeout <duration>           Maximum wall-clock wait for WAIT ticks. Bare number = seconds. Default: poll.timeoutSeconds (built-in 4.5m).
  --debounce <duration>          Settle window after the first SHEPHERD before returning. Bare number = seconds. Default: poll.debounceSeconds (built-in 60s). 0 disables.
  --quiet-status                 Print only changed WAIT snapshots. Overrides poll.quietStatus.
  --no-quiet-status              Print every WAIT snapshot. Overrides poll.quietStatus.
  --until-terminal               Continue through WAIT until SHEPHERD, MERGE, CANCEL, or ESCALATE.

Forwarded iterate flags:
  --ready-delay <duration>       Settle window before a clean PR cancels. Bare number = minutes. Example: 15m.
  --stall-timeout <duration>     Escalate repeated unchanged failures after this duration. Bare number = minutes. 0 disables.
  --no-auto-mark-ready           Do not convert draft PRs to ready for review.
  --merge                        Shepherd through readiness, then emit the stack merge commands.
  --instructions playbook|inline Render fix_code steps inline every tick (default) or fold the invariant ones into a playbook pointer. Default: iterate.instructions (inline).
  --transport auto|graphql|rest  Select GitHub transport. Default: github.transport (auto).
  --format text|json             Output Markdown text or JSON. Default: text.
  --verbose                      Include detailed per-tick lines.
  --help, -h                     Print this help and exit before GitHub, git, config, or log I/O.

Durations accept s/m/h suffixes: 30s, 4.5m, 1h. A bare number uses each flag's default unit (seconds
for --interval/--timeout/--debounce, minutes for --ready-delay/--stall-timeout); decimals are allowed only with
an explicit unit (4.5m).

Exit codes:
  0   CANCEL (every layer merged)
  10  WAIT
  13  ESCALATE
  14  CANCEL (a layer closed without merging)
  15  MERGE
  16  SHEPHERD (run the listed one-PR sessions, then rerun this stack command)
  A command/validation/GitHub failure exits with a sysexits.h code instead (see docs/exit-codes.md).`;
