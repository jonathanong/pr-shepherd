---
name: pr-shepherd
description: 'Codex-only skill for iterating a GitHub pull request to completion with pr-shepherd. Use for requests like "use pr-shepherd", "iterate PR #123", or "run pr-shepherd until this PR is ready".'
---

# pr-shepherd

Codex-only workflow for getting actionable PR updates from `pr-shepherd`.

## Workflow

1. Resolve the PR number.
   - If the user provides a PR number, use it.
   - If the user provides a GitHub PR URL, extract the PR number.
   - If no PR is provided, infer it from the current branch with:
     `gh pr view --json number --jq .number`
   - If no PR is found, report that and stop.

2. Use this objective for the whole goal:
   - `Run pr-shepherd PR_NUMBER cycles through the target repo package runner, picking a fresh sleep/timeout between 1 and 4 minutes before each rerun, until Shepherd emits [CANCEL] for ready-delay completion or PR #PR_NUMBER is merged/closed, or pr-shepherd escalates, including repeated unchanged CI failures.`

3. Select the package runner from the target repository root.
   - Prefer `package.json` `packageManager`: `pnpm@...` -> `pnpm exec`, `yarn@...` -> `yarn run`, `npm@...` -> `npx --no-install`.
   - If `packageManager` is absent, use lockfiles: `pnpm-lock.yaml` -> `pnpm exec`, `yarn.lock` -> `yarn run`, `package-lock.json` or no signal -> `npx --no-install`.
   - Example: in `~/filaments`, use `pnpm exec pr-shepherd ...` because the root package declares `packageManager: "pnpm@..."` and has `pnpm-lock.yaml`.

4. Verify the CLI is available.
   - Only when the target repository itself is the pr-shepherd source checkout, verify `bin/` and `node_modules/` exist before any local CLI invocation. If either is missing, run the source checkout's package-manager install command. This repository currently uses npm, so run:
     `npm install`
   - In other repositories, run through the selected package runner so Codex does not install packages implicitly. If the package is missing, tell the user to install `pr-shepherd` with the matching dev-dependency command: `pnpm add -D pr-shepherd`, `yarn add -D pr-shepherd`, or `npm install --save-dev pr-shepherd`.

5. Run the appropriate command from the repository root.
   - `<runner> pr-shepherd PR_NUMBER`

6. Print or summarize the important status, then follow the output's `## Instructions` exactly.

7. If the output indicates continuation, pick a fresh sleep/timeout between 1 and 4 minutes, wait that long, and run another explicit `<runner> pr-shepherd PR_NUMBER` cycle through the same runner.

8. Do not stop on `[WAIT]`, `[COOLDOWN]`, `[MARK_READY]`, or post-fix CI wait states. These are nonterminal Codex recurrence states.

9. Stop only when Shepherd emits `[CANCEL]` for ready-delay completion or PR #PR_NUMBER is merged/closed, or when it emits `[ESCALATE]`, including `stall-timeout` for repeated unchanged CI failures.

10. If the output includes fixes, pushes, rebases, or resolve commands, perform only the instructed scoped actions. Do not resolve, minimize, or dismiss comments until the CLI-provided post-push and `--require-sha` instructions are satisfied.
