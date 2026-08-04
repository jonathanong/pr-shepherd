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

4. **Exit codes:** an exit code of `64` or higher means the `pr-shepherd` command itself failed (bad flag, GitHub auth/permission error, transient failure, etc.) — surface the error and stop instead of looping. Any other exit code (`0` or `10`–`19`) means the command ran and the output above is real PR state — proceed to step 5.

5. **Terminal states (stop):**
   - `[CANCEL]` — ready-delay completed, or PR merged/closed.
   - `[ESCALATE]` — needs human direction (includes `stall-timeout` for repeated unchanged CI failures or CI that never starts).
   - **Do NOT merge the pull request** unless the human has explicitly requested or allowed it.
