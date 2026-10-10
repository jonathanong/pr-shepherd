# Cloud and event mode

Shepherd normally owns the wait: `pr-shepherd [PR]` sleeps between `WAIT` ticks and returns on a terminal action or `FIX_CODE`. A Claude Code cloud session works differently. It is woken by PR events (comments, reviews, check runs, pushes) and by scheduled wake-ups, and a turn that sleeps wastes the session. **Event mode** moves the wait out of Shepherd and into the session.

## Choosing the mode

`poll.mode` is `auto` (default), `poll`, or `event`. The CLI flag `--poll-mode`, the MCP `iterate` input `pollMode`, and the library option `pollMode` select the same values and win over configuration.

- `poll`: the existing behavior. The poll dispatcher loops, sleeps, and debounces.
- `event`: one tick per invocation. No sleeping, no debounce.
- `auto`: `event` when `CLAUDE_CODE_REMOTE=true`, otherwise `poll`.

In event mode `--interval`, `--timeout`, `--debounce`, `--quiet-status`, and `--until-terminal` have no effect. `pr-shepherd [PR]`, `pr-shepherd iterate`, `--stack`, and multi-PR selectors all run exactly one tick. Seen markers are written immediately (as `iterate` does), and the fingerprint cache is not used, so every tick is rebuilt from GitHub plus Shepherd's saved state.

## `nextCheck`

An event-mode result carries `pollMode: "event"` and, when another tick is meaningful, a `nextCheck`:

| Field       | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `at`        | RFC 3339 UTC time, rounded up to the minute                    |
| `inSeconds` | Seconds from now until `at`                                    |
| `reason`    | `ready-delay`, `stall-timeout`, `merge-queue`, or `safety-net` |

- `ready-delay`: the final ready-delay countdown ends at `at`. No event fires then.
- `stall-timeout`: an unchanged state would trip the stall timeout at `at`, or, on a `WAIT` tick, the oldest unstarted check's age (measured from its last update, else its creation) would reach the CI-start stall timeout. Used when it comes before the other deadline. For a `--stack` selector this is the stack-level stall timer, so an idle stack escalates on time instead of waiting for the safety net.
- `merge-queue`: the PR is queued; recheck about every five minutes.
- `safety-net`: a backstop about 50 minutes out for a missed event; a PR event usually wakes the session first. Used for every other non-terminal tick.

`nextCheck` is omitted for `CANCEL`, `ESCALATE`, `MERGE`, `MARK_READY`, a native-stack draft hold, and an aggregate result whose PRs are all terminal or every selected row is `CANCEL` or `ESCALATE`. Text prints a `**nextCheck**` header line, JSON and MCP `structuredContent` carry the object, and the `## Instructions` steps name the same time. A stack or multi-PR selector reports one `nextCheck` for the whole selection, and every row `pollCommand` (including bounded draft probes) carries `--poll-mode event`.

A native-stack draft hold prints its `--stack` handoff with `--poll-mode event` plus one step telling the agent not to rerun the held one-PR session and to keep no wake-up for it; after the handoff the agent follows only the stack selector's output, which ends the turn and schedules the next tick through its own `nextCheck`.

`MARK_READY` keeps the immediate rerun even in event mode. Its tick saw the PR as a draft, so the ready-delay timer was cleared rather than started; the next tick sees the PR ready, starts the timer, and reports its `ready-delay` deadline.

The instructions end with a "Cloud event loop" step pointing at the bundled playbook (`pr-shepherd playbook "Cloud event loop"`). It tells the agent to run one tick, follow the printed instructions on when to rerun or end the turn without sleeping, act only on Shepherd's output, and keep exactly one wake-up at `nextCheck.at`. After `FIX_CODE` it reruns Shepherd once and ends the turn. That rewrite also replaces the quota-aware `FIX_CODE` continuation; the quota warning itself still prints.

## Durable state

A cloud VM can be recycled between ticks, and its temp directory with it. When `PR_SHEPHERD_STATE_DIR` is unset, state moves to `<git-common-dir>/pr-shepherd-state` (found with the read-only `git rev-parse --git-common-dir`). It lives with the checkout rather than `TMPDIR`.

- Under `CLAUDE_CODE_REMOTE=true` this applies to every command.
- Otherwise it applies inside event-mode `iterate` and poll calls only, including their per-worktree log: the CLI resolves the poll mode before it opens the log. `pr-shepherd log-file` resolves the same mode from `poll.mode` and its own `--poll-mode` flag, so `pr-shepherd log-file --poll-mode event` prints the log an explicit event tick writes. A local `apply` in the same checkout would use the temp directory, so set `PR_SHEPHERD_STATE_DIR` if you mix modes.
- `PR_SHEPHERD_STATE_DIR` always wins.
- Outside a git repository the temp directory is used.

## Duplicate-reply scan

If the state directory is lost between ticks, the uncertain-reply record that normally prevents a duplicate reply is lost with it. In durable-state sessions, the `apply review` reply command that `iterate` generates carries `--adopt-existing-replies`. With that flag, before posting replies Shepherd reads the target threads and skips any whose last comment is already this exact Shepherd reply (including the hidden marker) from the authenticated viewer. It treats that as already posted, as with a confirmed reply in [comments.md](comments.md#recovering-an-uncertain-reply).

A direct, user-directed `apply review` without the flag never runs the scan: it forwards every supplied reply ID to GitHub, even in a cloud session.

The scan runs for every reply batch of a flagged command that has no local uncertain-reply record, not only when the whole state directory is empty, because other state files are written before replies. It costs one extra read per batch of ten threads. A failed read never blocks the reply.

## What is not verified

Event delivery, wake-up scheduling, and routine APIs are host features. Shepherd prints the time and the rule; the session chooses the mechanism. The playbook does not assume a scheduler exists and tells the agent to say so if none does.
