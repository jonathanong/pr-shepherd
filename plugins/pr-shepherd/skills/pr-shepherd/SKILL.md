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

5. **Stop conditions:**
   - Stop when the CLI emits `[CANCEL]` (ready-delay completed, or PR merged/closed).
   - Stop when the CLI emits `[ESCALATE]`, including `stall-timeout` for repeated unchanged CI failures.
   - All other actions (`[WAIT]`, `[MARK_READY]`, `[FIX_CODE]`) are non-terminal: follow the `## Instructions`. For Claude, schedule exactly one next session-only iteration and end the turn; do not sleep inline and do not create a recurring cron or polling loop (`while true`, repeated polling, etc.).
