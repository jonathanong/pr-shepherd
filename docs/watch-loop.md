# pr-shepherd iterate loop

[← README](../README.md) | [actions.md](actions.md) | [iterate-flow.md](iterate-flow.md)

## Overview

pr-shepherd iterates a PR to completion via the active session of Claude Code, Codex, or Grok. The skill runs the poll command `pr-shepherd`; if the CLI is unavailable it calls the MCP `iterate` tool. It then uses the returned action data with `apply` or `build_suggestion_patch` when needed.

Each non-terminal action is followed by another `pr-shepherd` poll (or another `iterate` call when only MCP is available). The active goal/runtime owns the recheck schedule after a non-WAIT result; the MCP server does not run an unbounded polling loop.

All three hosts use the same `pr-shepherd` skill. Claude Code users invoke it with `/goal /pr-shepherd:pr-shepherd`; Codex users invoke it with `/goal $pr-shepherd`; Grok users invoke it with `/pr-shepherd` or `/pr-shepherd:pr-shepherd`.

## Lifecycle

1. **User starts the goal**

   ```
   /goal /pr-shepherd:pr-shepherd <PR>   # Claude Code
   /goal $pr-shepherd <PR>              # Codex
   /pr-shepherd <PR>                    # Grok
   ```

   The skill resolves the optional PR number and runs the poll command `pr-shepherd` (or MCP `iterate` if the CLI is unavailable).

2. **The tool returns an action and data**
   The result includes the action, surfaced GitHub data, and structured review-mutation arguments when applicable. The skill follows its action-specific instructions exactly.

3. **Non-terminal actions** (`[WAIT]`, `[MARK_READY]`, `[FIX_CODE]`)
   The active goal follows the returned action-specific instructions and then invokes the skill again. `[FIX_CODE]` work must be handled before the next tick.

4. **Terminal actions**
   - `[CANCEL]` — PR is merged/closed, or the ready-delay has elapsed. Goal stops.
   - `[ESCALATE]` — PR needs human direction (stall-timeout, repeated CI failures, etc.). Goal stops.

For the full decision tree see [iterate-flow.md](iterate-flow.md). For the mermaid end-to-end diagram see [flow.md](flow.md).

## Sequence diagram

```
User                    Active Goal             pr-shepherd
 |                          |                        |
 |-- /goal /pr-shepherd --> |                        |
 |                          |-- pr-shepherd <PR> --> |
 |                          |                        |-- GraphQL fetch
 |                          |                        |-- classify
 |                          |                        |-- dispatch
 |                          |<-- action + data
 |                          |                        |
 |  [if non-terminal]       |                        |
 |                          |-- apply / patch work   |
 |                          |-- pr-shepherd <PR> --> |
 |                          |                        |
 |  [if cancel/escalate]    |                        |
 |                          |   goal ends            |
 |                          |                        |
 |   [if fix_code]          |                        |
 |                          |-- fix code             |
 |                          |-- commit               |
 |                          |-- push                 |
 |                          |-- apply review changes |
 |                          |-- pr-shepherd <PR> --> |
```

## Notes

- The skill's default fetch is the bounded poll command `pr-shepherd [PR]`, which sleeps through `WAIT`. MCP `iterate` is the fallback when the CLI is unavailable; the host then chooses when to recheck.
- Code changes (`fix_code`, rebase) are handled inline by the active goal — no subagent is spawned.
- The ready-delay (default 10 minutes) is read from `watch.readyDelayMinutes` in `.pr-shepherdrc.yml`. See [ready-delay.md](ready-delay.md) and [configuration.md](configuration.md).
