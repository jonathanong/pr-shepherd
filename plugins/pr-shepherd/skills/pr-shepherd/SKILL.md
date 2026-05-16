---
name: pr-shepherd
description: 'Iterate a GitHub pull request to completion with pr-shepherd. Use for requests like "use pr-shepherd", "iterate PR #123", or "run pr-shepherd until this PR is ready".'
user-invocable: true
argument-hint: "[PR number or URL]"
allowed-tools: ["Bash", "Read", "Grep", "Edit", "Write", "Glob", "Skill"]
---

# pr-shepherd

One-tick dispatcher for iterating a PR to completion.

## Arguments: $ARGUMENTS

## Steps

1. **Resolve PR number:**
   - If `$ARGUMENTS` contains a PR number, use it.
   - If `$ARGUMENTS` contains a GitHub PR URL, extract the number.
   - Otherwise, infer: `gh pr view --json number --jq .number`
   - If no PR found, report an error and stop.

2. **Short-circuit if merged or closed:**

   ```bash
   gh pr view <N> --json state --jq '.state'
   ```

   If `MERGED` or `CLOSED`, output: `PR #N is already merged/closed. Nothing to do.` and stop.

3. **Select the package runner** from the target repository root:
   - Prefer `package.json` `packageManager`: `pnpm@...` → `pnpm exec`, `yarn@...` → `yarn run`, `bun@...` → `bunx`, `npm@...` → `npx`.
   - If `packageManager` is absent, use lockfiles: `pnpm-lock.yaml` → `pnpm exec`, `yarn.lock` → `yarn run`, `bun.lock` / `bun.lockb` → `bunx`, `package-lock.json` or no signal → `npx`.

4. **Run one iterate tick:**

   If the package is missing in the target repository, tell the user to install pr-shepherd with the matching dev-dependency command: `pnpm add -D pr-shepherd`, `yarn add -D pr-shepherd`, `bun add -d pr-shepherd`, or `npm install --save-dev pr-shepherd`.

   ```bash
   <runner> pr-shepherd <N>
   ```

   Print the full output. Follow the `## Instructions` section exactly.

5. **Persistence:** Do not stop polling/iterating unless directed by the human or until the CLI returns a terminal state (`[CANCEL]` or `[ESCALATE]`). Every other action — `[WAIT]`, `[MARK_READY]`, `[FIX_CODE]` — is non-terminal and must be followed by another tick via one of the strategies below.

6. **Stop conditions (terminal states):**
   - Stop when the CLI emits `[CANCEL]` (ready-delay completed, or PR merged/closed).
   - Stop when the CLI emits `[ESCALATE]`, including `stall-timeout` for repeated unchanged CI failures.
   - **Do NOT merge the pull request** unless the human has explicitly requested or allowed it.

7. **Non-terminal actions** (`[WAIT]`, `[MARK_READY]`, `[FIX_CODE]`) — follow the `## Instructions` in the output. Pick one iteration strategy; the CLI's instructions already nudge the runtime-appropriate default:
   - **Blocking poll** — rerun as `<runner> pr-shepherd poll <N> [--interval <duration>] [--timeout <duration>]` (defaults: interval 30s, timeout 5m). Holds the agent turn until the action is non-WAIT or the timeout fires. Simplest when the agent cannot reliably schedule its own follow-up.
   - **Scheduled wakeup + one tick** — schedule a single session-only follow-up task to rerun `<runner> pr-shepherd <N>` after a fresh 30s–4m delay, then end the turn.
   - **Inline sleep + rerun** — sleep inline for a fresh 30s–4m delay, then rerun.

   **Never write a custom polling loop** (shell `while`/`until` loops, script files that loop over pr-shepherd output, etc.). Custom loops poll only for terminal states and silently skip `[FIX_CODE]` handling — actionable review threads, failing checks, and resolve commands get missed. Use `pr-shepherd poll` for WAIT-state waiting; it exits on any non-WAIT action so the caller handles `[FIX_CODE]` and other actionable outputs normally.

   Do not combine strategies (e.g., poll AND schedule a wakeup). Remember step 5 — every non-terminal output requires a follow-up tick.
