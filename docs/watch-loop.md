# pr-shepherd iterate loop

[← README](../README.md) | [actions.md](actions.md) | [iterate-flow.md](iterate-flow.md)

## Overview

pr-shepherd iterates a PR to completion via the active goal loops of Claude Code and Codex. The skill always invokes `pr-shepherd poll <PR>`, which loops internally while the PR is in `[WAIT]` and returns whenever an actionable or terminal state appears.

Each non-terminal action is followed by another `pr-shepherd poll <PR>` invocation. Do not run `while true` or unbounded polling loops outside of `pr-shepherd poll`.

Both runtimes use the same `pr-shepherd` skill. Claude Code users invoke it with `/goal /pr-shepherd:pr-shepherd`; Codex users invoke it with `/goal $pr-shepherd`.

## Lifecycle

1. **User starts the goal**

   ```
   /goal /pr-shepherd:pr-shepherd <PR>   # Claude Code
   /goal $pr-shepherd <PR>              # Codex
   ```

   The skill resolves the PR number and runs poll:

   ```bash
   pr-shepherd poll <PR>
   ```

2. **CLI emits an action with `## Instructions`**
   The output begins with `# PR #N [ACTION]` and ends with a numbered `## Instructions` block. The skill follows those instructions exactly.

3. **Non-terminal actions** (`[WAIT]`, `[MARK_READY]`, `[FIX_CODE]`)
   The active goal follows the `## Instructions` and then invokes `pr-shepherd poll <PR>` again. `[FIX_CODE]` output must be handled before the next poll invocation.

4. **Terminal actions**
   - `[CANCEL]` — PR is merged/closed, or the ready-delay has elapsed. Goal stops.
   - `[ESCALATE]` — PR needs human direction (stall-timeout, repeated CI failures, etc.). Goal stops.

For the full decision tree see [iterate-flow.md](iterate-flow.md). For the mermaid end-to-end diagram see [flow.md](flow.md).

## Sequence diagram

```
User                    Active Goal             shepherd iterate / poll
 |                          |                        |
 |-- /goal /pr-shepherd --> |                        |
 |                          |-- poll <PR> ---------> |
 |                          |                        |-- GraphQL fetch
 |                          |                        |-- classify
 |                          |                        |-- dispatch
 |                          |<-- [ACTION] + ## Instructions
 |                          |                        |
 |  [if non-terminal]       |                        |
 |                          |-- follow instructions  |
 |                          |-- poll <PR> ---------> |
 |                          |                        |
 |  [if cancel/escalate]    |                        |
 |                          |   goal ends            |
 |                          |                        |
 |   [if fix_code]          |                        |
 |                          |-- fix code             |
 |                          |-- commit               |
 |                          |-- push                 |
 |                          |-- resolve threads      |
 |                          |-- poll <PR> ---------> |
```

## Notes

- Poll uses `--interval` and `--timeout` for WAIT-state rechecks. Defaults are 30 seconds and 5 minutes.
- Code changes (`fix_code`, rebase) are handled inline by the active goal — no subagent is spawned.
- The ready-delay (default 10 minutes) is read from `watch.readyDelayMinutes` in `.pr-shepherdrc.yml`. See [ready-delay.md](ready-delay.md) and [configuration.md](configuration.md).
