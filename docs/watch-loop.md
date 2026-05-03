# shepherd watch loop

[← README](../README.md) | [actions.md](actions.md) | [iterate-flow.md](iterate-flow.md)

## Overview

The `/pr-shepherd:monitor <PR>` slash command starts a Claude Code dynamic loop that polls PR status on an agent-chosen cadence. This document explains how all the pieces fit together.

Codex does not provide `/loop` scheduling in this workflow. When `pr-shepherd` detects Codex (`AGENT=codex` or `CODEX_CI=1`), `monitor` output tells Codex to run explicit iterate ticks with the reusable `npx pr-shepherd <PR>` command. Before each rerun, Codex picks a fresh sleep/timeout between 1 and 4 minutes until Shepherd emits `[CANCEL]` for ready-delay completion or merged/closed, or `[ESCALATE]` (including `stall-timeout` for repeated unchanged CI failures).

## Lifecycle

Claude Code lifecycle:

1. **User runs `/pr-shepherd:monitor <PR>`**
   - The skill runs `npx pr-shepherd monitor <PR>`, which emits an interval-free dynamic scheduling bootstrap block.
   - The skill follows `## Instructions` in that output: calls `CronList`, checks active scheduled tasks for an existing task whose prompt contains the loop tag, reuses it if present, and otherwise invokes `/loop` with `args` set to the full `## Loop prompt` body and no fixed interval prefix.

2. **`/loop` enters dynamic mode**
   - Dynamic `/loop` is not cron-backed. At the end of each nonterminal tick, the agent calls `ScheduleWakeup` with `delaySeconds` between 60 and 240 using the same loop prompt body.
   - Each tick also calls `CronList`, checks active scheduled tasks for duplicate prompts with the same loop tag, keeps the lowest task ID, and cancels duplicates with `CronDelete` before running `pr-shepherd`.
   - The loop runs until the `cancel` action fires, Shepherd escalates, or the user cancels manually.

3. **Each tick runs `pr-shepherd`**
   - The loop prompt runs (single Bash invocation):
     ```bash
     pr-shepherd <PR>
     ```
   - Exit codes 0, 1, 2, and 3 are all valid (not errors).

4. **Loop prompt reads text output and acts**
   - Reads the `[ACTION]` tag in the first line of stdout (see [actions.md](actions.md) for the output shape).
   - Acts on it inline — no subagent is spawned.

5. **Loop stops**
   - When `action === 'cancel'`, the loop prompt does not schedule another wakeup.
   - This happens when the PR is merged/closed OR when the ready-delay has elapsed.

For the full mermaid diagram see [flow.md](flow.md).

## Sequence diagram

```
User                    Main Agent              shepherd iterate
 |                          |                        |
 |-- /pr-shepherd:monitor <PR> ------> |                        |
 |                          |-- /loop dynamic        |
 |                          |   no fixed interval    |
 |                          |                        |
 |            [ScheduleWakeup 60-240s]               |
 |                          |-- iterate <PR> ------> |
 |                          |                        |-- GraphQL fetch
 |                          |                        |-- classify
 |                          |                        |-- dispatch
 |                          |<-- text [ACTION] ------|
 |                          |                        |
 |           [if cancel]    |                        |
 |                          |-- stop scheduling ----> |
 |                          |                   [loop stops]
 |           [if fix_code]  |                        |
 |                          |-- fix code             |
 |                          |-- commit               |
 |                          |-- push                 |
 |                          |-- resolve threads      |
```

## Notes

- The loop prompt does not fetch GitHub directly — it consumes only the structured output emitted by `shepherd iterate` (text by default, or JSON with `--format=json`; both carry the same information). The `fix_code` action includes GitHub-derived excerpts (threads, comments, check output), but the full GraphQL response is never read by the loop.
- Code changes (fix_code, rebase) are handled inline by the loop prompt — no separate agent is spawned.
- The loop interval is dynamic and not configurable. The ready-delay (default 10 minutes) is read from `watch.readyDelayMinutes` in `.pr-shepherdrc.yml`. See [ready-delay.md](ready-delay.md) and [configuration.md](configuration.md).
