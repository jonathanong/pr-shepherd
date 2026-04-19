# shepherd watch loop

[← README.md](README.md) | [actions.md](actions.md) | [iterate-flow.md](iterate-flow.md)

## Overview

The `/pr-shepherd:monitor <PR>` slash command starts a cron loop that polls PR status every 4 minutes. This document explains how all the pieces fit together.

## Lifecycle

1. **User runs `/pr-shepherd:monitor <PR>`**
   - The `/pr-shepherd:monitor` skill invokes the `/loop` skill to schedule a cron job that fires every 4 minutes.
   - Each cron tick runs `shepherd iterate` inline and acts on the JSON result.

2. **`/loop` schedules cron ticks**
   - `/loop` schedules a tick every 4 minutes (configurable via `watch.interval`).
   - The loop runs until the `cancel` action fires or the user cancels manually.

3. **Each tick runs `shepherd iterate`**
   - The cron prompt runs (single Bash invocation):
     ```bash
     pr-shepherd iterate <PR> --ready-delay <READY_DELAY> --last-push-time "$(git log -1 --format=%ct HEAD)" --format=json
     ```
   - Exit codes 0, 1, 2, and 3 are all valid (not errors).

4. **Cron prompt parses JSON and acts**
   - Reads the `action` field from stdout.
   - Acts on it inline — no subagent is spawned.

5. **Loop cancels**
   - When `action === 'cancel'`, the cron prompt invokes `/loop cancel`.
   - This happens when the PR is merged/closed OR when the ready-delay has elapsed.

For the full mermaid diagram see [flow.md](flow.md).

## Sequence diagram

```
User                    Main Agent              shepherd iterate
 |                          |                        |
 |-- /pr-shepherd:monitor <PR> ------> |                        |
 |                          |-- CronCreate           |
 |                          |   every 4m             |
 |                          |                        |
 |                  [cron tick every 4m]             |
 |                          |-- iterate <PR> ------> |
 |                          |                        |-- GraphQL fetch
 |                          |                        |-- classify
 |                          |                        |-- dispatch
 |                          |<-- JSON {action} ------|
 |                          |                        |
 |           [if cancel]    |                        |
 |                          |-- /loop cancel ------> |
 |                          |                   [loop stops]
 |           [if fix_code]  |                        |
 |                          |-- fix code             |
 |                          |-- commit               |
 |                          |-- push                 |
 |                          |-- resolve threads      |
```

## Notes

- The cron prompt does not fetch GitHub directly — it consumes only the structured JSON emitted by `shepherd iterate`. The `fix_code` action includes GitHub-derived excerpts (threads, comments, check output), but the full GraphQL response is never read by the loop.
- Code changes (fix_code, rebase) are handled inline by the cron prompt — no separate agent is spawned.
- The 4-minute interval is the default and can be overridden with `every <interval>` in the `/shepherd` argument.
- The ready-delay (default 10 minutes) is passed through as `--ready-delay`. See [ready-delay.md](ready-delay.md).
