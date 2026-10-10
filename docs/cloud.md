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

| Field         | Meaning                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `at`          | RFC 3339 UTC time, rounded up to the minute                                    |
| `inSeconds`   | Seconds from now until `at`                                                    |
| `reason`      | `ready-delay`, `stall-timeout`, `merge-queue`, or `safety-net`                 |
| `eventDriven` | `true` when a PR event is expected to wake you before `at` (only `safety-net`) |

- `ready-delay`: the final ready-delay countdown ends at `at`. No event fires then.
- `stall-timeout`: an unchanged state would trip the stall timeout at `at`. Used when it comes before the other deadline.
- `merge-queue`: the PR is queued; recheck about every five minutes.
- `safety-net`: a backstop about 50 minutes out for a missed event. Used for every other non-terminal tick.

`nextCheck` is omitted for `CANCEL`, `ESCALATE`, `MERGE`, a native-stack draft hold, and an aggregate result whose PRs are all terminal. Text prints a `**nextCheck**` header line, JSON and MCP `structuredContent` carry the object, and the `## Instructions` steps name the same time. A stack or multi-PR selector reports one `nextCheck` for the whole selection.

The instructions end with a "Cloud event loop" step pointing at the bundled playbook (`pr-shepherd playbook "Cloud event loop"`). It tells the agent to run one tick, end the turn without sleeping, act only on Shepherd's output, and keep exactly one wake-up at `nextCheck.at`. After `FIX_CODE` it reruns Shepherd once and ends the turn.

## Durable state

A cloud VM can be recycled between ticks, and its temp directory with it. When `PR_SHEPHERD_STATE_DIR` is unset, state moves to `<git-common-dir>/pr-shepherd-state` (found with the read-only `git rev-parse --git-common-dir`). It lives with the checkout rather than `TMPDIR`.

- Under `CLAUDE_CODE_REMOTE=true` this applies to every command.
- Otherwise it applies inside event-mode `iterate` and poll calls only. A local `apply` in the same checkout would use the temp directory, so set `PR_SHEPHERD_STATE_DIR` if you mix modes.
- `PR_SHEPHERD_STATE_DIR` always wins.
- Outside a git repository the temp directory is used.

## Duplicate-reply scan

If the state directory is lost between ticks, the uncertain-reply record that normally prevents a duplicate reply is lost with it. In durable-state sessions, before posting replies Shepherd reads the target threads and skips any whose last comment is already this exact Shepherd reply (including the hidden marker) from the authenticated viewer. It treats that as already posted, as with a confirmed reply in [comments.md](comments.md#recovering-an-uncertain-reply).

The scan runs for every reply batch in a durable session that has no local uncertain-reply record, not only when the whole state directory is empty, because other state files are written before replies. It costs one extra read per batch of ten threads. A failed read never blocks the reply.

## What is not verified

Event delivery, wake-up scheduling, and routine APIs are host features. Shepherd prints the time and the rule; the session chooses the mechanism. The playbook does not assume a scheduler exists and tells the agent to say so if none does.
