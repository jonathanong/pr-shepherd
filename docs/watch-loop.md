# pr-shepherd iterate loop

[← README](../README.md) | [actions.md](actions.md) | [iterate-flow.md](iterate-flow.md)

## Overview

pr-shepherd iterates a PR to completion via the active goal loops of Claude Code and Codex. There is no fixed-interval cron or `/loop` scheduler — each non-terminal tick tells the running goal to pick a fresh 30s–4m delay and rerun the iterate command.

Both runtimes use the same `pr-shepherd` skill. Claude Code users invoke it with `/goal /pr-shepherd:pr-shepherd`; Codex users invoke it with `/goal $pr-shepherd`.

## Lifecycle

1. **User starts the goal**
   ```
   /goal /pr-shepherd:pr-shepherd <PR>   # Claude Code
   /goal $pr-shepherd <PR>              # Codex
   ```
   The skill resolves the PR number, picks the package runner, and runs one iterate tick:
   ```bash
   <runner> pr-shepherd <PR>
   ```

2. **CLI emits an action with `## Instructions`**
   The output begins with `# PR #N [ACTION]` and ends with a numbered `## Instructions` block. The skill follows those instructions exactly.

3. **Non-terminal actions** (`[WAIT]`, `[MARK_READY]`, `[FIX_CODE]`)
   The `## Instructions` tell the active goal: "Pick a fresh sleep/timeout between 30 seconds and 4 minutes, wait that long, then rerun `<runner> pr-shepherd <PR>` to continue the active goal."

4. **Terminal actions**
   - `[CANCEL]` — PR is merged/closed, or the ready-delay has elapsed. Goal stops.
   - `[ESCALATE]` — PR needs human direction (stall-timeout, repeated CI failures, etc.). Goal stops.

For the full decision tree see [iterate-flow.md](iterate-flow.md). For the mermaid end-to-end diagram see [flow.md](flow.md).

## Sequence diagram

```
User                    Active Goal             shepherd iterate
 |                          |                        |
 |-- /goal /pr-shepherd --> |                        |
 |                          |-- pr-shepherd <PR> --> |
 |                          |                        |-- GraphQL fetch
 |                          |                        |-- classify
 |                          |                        |-- dispatch
 |                          |<-- [ACTION] + ## Instructions
 |                          |                        |
 |  [if non-terminal]       |                        |
 |                          |-- sleep 30s–4m         |
 |                          |-- pr-shepherd <PR> --> |  (next tick)
 |                          |                        |
 |  [if cancel/escalate]    |                        |
 |                          |   goal ends            |
 |                          |                        |
 |   [if fix_code]          |                        |
 |                          |-- fix code             |
 |                          |-- commit               |
 |                          |-- push                 |
 |                          |-- resolve threads      |
 |                          |-- sleep 30s–4m         |
 |                          |-- pr-shepherd <PR> --> |  (recheck)
```

## Notes

- The iterate loop does not have a fixed cadence. The agent picks a fresh delay (30s–4m) before each rerun, adapting to CI latency automatically.
- Code changes (`fix_code`, rebase) are handled inline by the active goal — no subagent is spawned.
- The ready-delay (default 10 minutes) is read from `watch.readyDelayMinutes` in `.pr-shepherdrc.yml`. See [ready-delay.md](ready-delay.md) and [configuration.md](configuration.md).
