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

2. **Select the package runner** from the target repository root:
   - Prefer `package.json` `packageManager`: `pnpm@...` → `pnpm exec`, `yarn@...` → `yarn run`, `bun@...` → `bunx`, `npm@...` → `npx`.
   - If `packageManager` is absent, use lockfiles: `pnpm-lock.yaml` → `pnpm exec`, `yarn.lock` → `yarn run`, `bun.lock` / `bun.lockb` → `bunx`, `package-lock.json` or no signal → `npx`.

3. **Run `pr-shepherd poll`, nothing else:**

   If the package is missing in the target repository, first check `gh pr view <N> --json state --jq .state`. If it prints `MERGED` or `CLOSED`, report `PR #N is already merged/closed. Nothing to do.` and stop. Otherwise, tell the user to install pr-shepherd with the matching dev-dependency command: `pnpm add -D pr-shepherd`, `yarn add -D pr-shepherd`, `bun add -d pr-shepherd`, or `npm install --save-dev pr-shepherd`.

   ```bash
   <runner> pr-shepherd poll <N>
   ```

   Preserve any supported flags from `$ARGUMENTS` after the PR number or URL, such as `--ready-delay 15m`, `--interval 1m`, or `--timeout 15m`.

   Print the full output. Follow the `## Instructions` section exactly for the current action. When those instructions tell you to stop and recheck with `pr-shepherd <N>` after a delay, use `<runner> pr-shepherd poll <N>` as the next invocation instead; do not also run the one-shot command.

4. **Persistence:** Continuously call `<runner> pr-shepherd poll <N>` until the CLI returns `[CANCEL]` or `[ESCALATE]`, unless the human directs you to stop. Every other action is non-terminal:
   - `[WAIT]`: call `<runner> pr-shepherd poll <N>` again.
   - `[MARK_READY]`: call `<runner> pr-shepherd poll <N>` again.
   - `[FIX_CODE]`: follow the output's `## Instructions`, then call `<runner> pr-shepherd poll <N>` again.

   Treat a nonzero poll exit code as PR state only when the output contains a matching `# PR #N [ACTION]` heading. Exit code `1` can also mean a command or validation failure; if there is no `[FIX_CODE]` heading, surface the error and stop instead of looping.

5. **Stop conditions (terminal states):**
   - Stop when the CLI emits `[CANCEL]` (ready-delay completed, or PR merged/closed).
   - Stop when the CLI emits `[ESCALATE]`, including `stall-timeout` for repeated unchanged CI failures.
   - **Do NOT merge the pull request** unless the human has explicitly requested or allowed it.
