# shepherd watch loop

[← README](../README.md) | [actions.md](actions.md) | [iterate-flow.md](iterate-flow.md)

## Overview

The `/pr-shepherd:monitor <PR>` slash command starts a cron loop that polls PR status at the configured interval (default `4m`, set via `watch.interval`). This document explains how all the pieces fit together.

## Lifecycle

1. **User runs `/pr-shepherd:monitor <PR>`**
   - The skill runs `npx pr-shepherd monitor <PR>`, which reads `watch.*` config and emits a bootstrap Markdown block.
   - The skill follows `## Instructions` in that output: checks for an existing loop (dedup), then invokes the `/loop` skill with `args` built as the interval/flags value from the `Loop args` line concatenated with a blank line and the full `## Loop prompt` body.

2. **`/loop` schedules cron ticks**
   - `/loop` schedules a tick at the interval from config (default `4m`, configurable via `watch.interval`).
   - The loop runs until the `cancel` action fires or the user cancels manually.

3. **Each tick runs `shepherd iterate`**
   - The cron prompt runs (single Bash invocation):
     ```bash
     pr-shepherd iterate <PR>
     ```
   - Exit codes 0, 1, 2, and 3 are all valid (not errors).

4. **Cron prompt reads text output and acts**
   - Reads the `[ACTION]` tag in the first line of stdout (see [actions.md](actions.md) for the output shape).
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
 |                          |   every <interval>     |
 |                          |                        |
 |            [cron tick every <interval>]           |
 |                          |-- iterate <PR> ------> |
 |                          |                        |-- GraphQL fetch
 |                          |                        |-- classify
 |                          |                        |-- dispatch
 |                          |<-- text [ACTION] ------|
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

- The cron prompt does not fetch GitHub directly — it consumes only the structured output emitted by `shepherd iterate` (text by default, or JSON with `--format=json`; both carry the same information). The `fix_code` action includes GitHub-derived excerpts (threads, comments, check output), but the full GraphQL response is never read by the loop.
- Code changes (fix_code, rebase) are handled inline by the cron prompt — no separate agent is spawned.
- The loop interval (default `4m`) and the ready-delay (default 10 minutes) are read from `watch.interval` and `watch.readyDelayMinutes` in `.pr-shepherdrc.yml`. There is no per-invocation override — change the config file to adjust these values. See [ready-delay.md](ready-delay.md) and [configuration.md](configuration.md).
