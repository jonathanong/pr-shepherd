---
name: pr-shepherd
description: 'Iterate a GitHub pull request to completion with pr-shepherd. Use for requests like "use pr-shepherd", "iterate PR #123", or "run pr-shepherd until this PR is ready".'
user-invocable: true
argument-hint: "[PR number or URL]"
allowed-tools: ["Bash", "Read", "Grep", "Edit", "Write", "Glob", "Skill"]
---

# pr-shepherd

Poll dispatcher for iterating a PR to completion.

## Arguments: $ARGUMENTS

## Steps

1. **Resolve the PR number** (`$N`): use the number or URL in `$ARGUMENTS`; otherwise infer it with `gh pr view --json number --jq .number`. If none is found, report an error and stop.

2. **Define the poll command once:** `pr-shepherd $N --interval 60s --until-terminal --quiet-status`. Do not forward `$ARGUMENTS` as extra flags. Run `pr-shepherd --help` to inspect supported options.

3. **Loop:** Run the poll, print its full output, and follow its `## Instructions` section exactly. Then run the poll again. Repeat until the CLI emits `[CANCEL]` or `[ESCALATE]`, unless the human directs you to stop. `[FIX_CODE]` is non-terminal: do its instructions, then poll again. The poll already waits between ticks via `--interval`; do not add manual `sleep`s between ticks.

4. **Nonzero exit codes:** Treat a nonzero poll exit as PR state only when the output contains a matching `# PR #$N [ACTION]` heading. Exit `1` can also mean a command or validation failure; if there is no `[ACTION]` heading, surface the error and stop instead of looping.

5. **Terminal states (stop):**
   - `[CANCEL]` — ready-delay completed, or PR merged/closed.
   - `[ESCALATE]` — needs human direction (includes `stall-timeout` for repeated unchanged CI failures or CI that never starts).
   - **Do NOT merge the pull request** unless the human has explicitly requested or allowed it.
