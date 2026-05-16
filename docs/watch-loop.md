# pr-shepherd iterate loop

[← README](../README.md) | [actions.md](actions.md) | [iterate-flow.md](iterate-flow.md)

## Overview

pr-shepherd iterates a PR to completion via the active goal loops of Claude Code and Codex. Three iteration strategies are valid:

- **Scheduled wakeup + one tick** — schedule a single session-only follow-up task after a fresh 30s–4m delay, then end the turn.
- **Inline sleep + rerun** — sleep inline for a fresh 30s–4m delay, then rerun the iterate command.
- **Blocking poll** — run `<runner> pr-shepherd poll <PR>` to loop internally until a non-WAIT action appears (bounded by `--timeout`, default 5m).

Each non-terminal action is a single tick (or a bounded poll session). Do not run `while true` or unbounded polling loops outside of `pr-shepherd poll`.

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
   The `## Instructions` tell the active goal how to continue. Pick one strategy:
   - Schedule one next session-only follow-up task and end the turn.
   - Sleep inline for a fresh 30s–4m delay, then rerun `<runner> pr-shepherd <PR>`.
   - Run `<runner> pr-shepherd poll <PR>` to block until the action is non-WAIT.

   Do not run `while true` or unbounded polling loops outside of `pr-shepherd poll`.

4. **Terminal actions**
   - `[CANCEL]` — PR is merged/closed, or the ready-delay has elapsed. Goal stops.
   - `[ESCALATE]` — PR needs human direction (stall-timeout, repeated CI failures, etc.). Goal stops.

For the full decision tree see [iterate-flow.md](iterate-flow.md). For the mermaid end-to-end diagram see [flow.md](flow.md).

## Sequence diagram

```
User                    Active Goal             shepherd iterate / poll
 |                          |                        |
 |-- /goal /pr-shepherd --> |                        |
 |                          |-- pr-shepherd <PR> --> |
 |                          |    (or poll <PR>)       |
 |                          |                        |-- GraphQL fetch
 |                          |                        |-- classify
 |                          |                        |-- dispatch
 |                          |<-- [ACTION] + ## Instructions
 |                          |                        |
 |  [if non-terminal]       |                        |
 |                          |-- schedule next tick   |  (one-tick strategy)
 |                          |-- sleep + rerun inline |  (inline strategy)
 |                          |-- poll loops + sleep   |  (poll mode: internal)
 |                          |-- pr-shepherd <PR> --> |
 |                          |                        |
 |  [if cancel/escalate]    |                        |
 |                          |   goal ends            |
 |                          |                        |
 |   [if fix_code]          |                        |
 |                          |-- fix code             |
 |                          |-- commit               |
 |                          |-- push                 |
 |                          |-- resolve threads      |
 |                          |-- schedule or sleep    |
 |                          |-- pr-shepherd <PR> --> |
```

## Notes

- The iterate loop does not have a fixed cadence. Each non-terminal tick uses a fresh delay (30s-4m), adapting to CI latency automatically.
- Code changes (`fix_code`, rebase) are handled inline by the active goal — no subagent is spawned.
- The ready-delay (default 10 minutes) is read from `watch.readyDelayMinutes` in `.pr-shepherdrc.yml`. See [ready-delay.md](ready-delay.md) and [configuration.md](configuration.md).
