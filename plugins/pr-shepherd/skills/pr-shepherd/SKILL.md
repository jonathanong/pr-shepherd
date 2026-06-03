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

1. **Resolve PR number:**
   - If `$ARGUMENTS` contains a PR number, use it.
   - If `$ARGUMENTS` contains a GitHub PR URL, extract the number.
   - Otherwise, infer: `gh pr view --json number --jq .number`
   - If no PR found, report an error and stop.

2. **Run `pr-shepherd`:**

   ```bash
   pr-shepherd <N> --interval 45s --timeout 4m
   ```

   Do not pass `$ARGUMENTS` through as extra flags. If you need to inspect supported options, run `pr-shepherd --help`.
   Do not wrap this command in shell delays such as `sleep`, `sleep && pr-shepherd`, or an external wait loop; the poll dispatcher owns waiting through `--interval` and `--timeout`.

   Print the full output. Follow the `## Instructions` section exactly for the current action.

3. **Persistence:** Continuously call `pr-shepherd <N> --interval 45s --timeout 4m` until the CLI returns `[CANCEL]` or `[ESCALATE]`, unless the human directs you to stop. Every other action is non-terminal:
   - `[WAIT]`: call `pr-shepherd <N> --interval 45s --timeout 4m` again.
   - `[MARK_READY]`: call `pr-shepherd <N> --interval 45s --timeout 4m` again.
   - `[FIX_CODE]`: follow the output's `## Instructions`, then call `pr-shepherd <N> --interval 45s --timeout 4m` again.

   If the CLI instructions mention rechecking after a fresh delay, satisfy that by invoking `pr-shepherd <N> --interval 45s --timeout 4m` directly. Do not run a separate `sleep`; repeated invocations should be bounded poll-dispatcher calls, not shell-managed waiting.

   Treat a nonzero poll exit code as PR state only when the output contains a matching `# PR #N [ACTION]` heading. Exit code `1` can also mean a command or validation failure; if there is no `[FIX_CODE]` heading, surface the error and stop instead of looping.

4. **Stop conditions (terminal states):**
   - Stop when the CLI emits `[CANCEL]` (ready-delay completed, or PR merged/closed).
   - Stop when the CLI emits `[ESCALATE]`, including `stall-timeout` for repeated unchanged CI failures or CI that never starts.
   - **Do NOT merge the pull request** unless the human has explicitly requested or allowed it.
