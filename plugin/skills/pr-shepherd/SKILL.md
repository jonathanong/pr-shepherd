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

2. **Short-circuit if merged:**

   ```bash
   gh pr view <N> --json state --jq '.state'
   ```

   If `MERGED` or `CLOSED`, output: `PR #N is already merged/closed. Nothing to do.` and stop.

3. **Select the package runner** from the target repository root:
   - Prefer `package.json` `packageManager`: `pnpm@...` → `pnpm exec`, `yarn@...` → `yarn run`, `npm@...` → `npx --no-install`.
   - If `packageManager` is absent, use lockfiles: `pnpm-lock.yaml` → `pnpm exec`, `yarn.lock` → `yarn run`, `package-lock.json` or no signal → `npx --no-install`.

4. **Verify CLI availability** (only when the target repository itself is the pr-shepherd source checkout):
   - Only when the target repository itself is the pr-shepherd source checkout, verify `bin/` and `node_modules/` exist before any local CLI invocation. If either is missing, run the source checkout's package-manager install command. This repository currently uses npm, so run:
     `npm install`
   - In other repositories, run through the selected package runner. If the package is missing, tell the user to install `pr-shepherd` with the matching dev-dependency command: `pnpm add -D pr-shepherd`, `yarn add -D pr-shepherd`, or `npm install --save-dev pr-shepherd`.

5. **Run one iterate tick:**

   ```bash
   <runner> pr-shepherd <N>
   ```

   Print the full output. Follow the `## Instructions` section exactly.

6. **Stop conditions:**
   - Stop when the CLI emits `[CANCEL]` (ready-delay completed, or PR merged/closed).
   - Stop when the CLI emits `[ESCALATE]`, including `stall-timeout` for repeated unchanged CI failures.
   - All other actions (`[WAIT]`, `[MARK_READY]`, `[FIX_CODE]`) are non-terminal: follow the `## Instructions` to sleep/wait and rerun.
