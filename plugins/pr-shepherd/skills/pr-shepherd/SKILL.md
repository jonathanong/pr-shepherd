---
name: pr-shepherd
description: 'Codex-only skill for checking, updating, monitoring, or resolving a GitHub pull request with pr-shepherd. Use for requests like "check this PR", "use pr-shepherd", "iterate PR #123", "resolve this PR''s comments", or "run pr-shepherd until this PR is ready". For open-ended requests, create a Codex goal and run explicit pr-shepherd cycles through the target repo package runner, picking a fresh sleep/timeout between 1 and 4 minutes before each rerun until Shepherd emits `[CANCEL]` for ready-delay completion or merged/closed, or `[ESCALATE]` including repeated unchanged CI failures.'
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

2. Decide whether this is one cycle or an open-ended goal.
   - For one-off requests such as "check this PR", "run pr-shepherd once", or "resolve this PR's comments", run one explicit CLI command.
   - For requests such as "continue", "until ready", "until this PR is ready", or "keep iterating", create a Codex goal before the first recurring cycle with this objective:
     `Run pr-shepherd PR_NUMBER cycles through the target repo package runner, picking a fresh sleep/timeout between 1 and 4 minutes before each rerun, until Shepherd emits [CANCEL] for ready-delay completion or PR #PR_NUMBER is merged/closed, or pr-shepherd escalates, including repeated unchanged CI failures.`

3. Select the package runner from the target repository root.
   - Prefer `package.json` `packageManager`: `pnpm@...` -> `pnpm exec`, `yarn@...` -> `yarn run`, `npm@...` -> `npx --no-install`.
   - If `packageManager` is absent, use lockfiles: `pnpm-lock.yaml` -> `pnpm exec`, `yarn.lock` -> `yarn run`, `package-lock.json` or no signal -> `npx --no-install`.
   - Example: in `~/filaments`, use `pnpm exec pr-shepherd ...` because the root package declares `packageManager: "pnpm@..."` and has `pnpm-lock.yaml`.

4. Verify the CLI is available.
   - Only when the target repository itself is the pr-shepherd source checkout, verify `bin/` and `node_modules/` exist before any local CLI invocation. If either is missing, run the source checkout's package-manager install command. This repository currently uses npm, so run:
     `npm install`
   - In other repositories, run through the selected package runner so Codex does not install packages implicitly. If the package is missing, tell the user to install `pr-shepherd` with the matching dev-dependency command: `pnpm add -D pr-shepherd`, `yarn add -D pr-shepherd`, or `npm install --save-dev pr-shepherd`.

5. Run the appropriate command from the repository root.
   - For a status check:
     `<runner> pr-shepherd check PR_NUMBER`
   - For review comment resolution:
     `<runner> pr-shepherd resolve PR_NUMBER --fetch`
   - For a monitor bootstrap:
     `<runner> pr-shepherd monitor PR_NUMBER`
   - For the recurring explicit monitor tick:
     `<runner> pr-shepherd PR_NUMBER`
   - `pr-shepherd iterate PR_NUMBER` remains supported as a legacy alias, but use the default `pr-shepherd PR_NUMBER` form for recurring Codex cycles.

6. Print or summarize the important status, then follow the output's `## Instructions` exactly.

7. Do not call `/loop`, `ScheduleWakeup`, `CronCreate`, or `pr-shepherd monitor` for recurrence. Codex does explicit `pr-shepherd PR_NUMBER` cycles.

8. For open-ended goal requests, complete the CLI-provided instructions for the current cycle. If the output says to continue the active Codex goal, pick a fresh sleep/timeout between 1 and 4 minutes, wait that long, and run another explicit `pr-shepherd PR_NUMBER` cycle through the same runner.

9. Do not stop an open-ended goal only because the output is `[WAIT]`, `[COOLDOWN]`, `[MARK_READY]`, or a post-fix CI wait. These are nonterminal Codex recurrence states.

10. Stop only when Shepherd emits `[CANCEL]` for ready-delay completion or merged/closed, or when it emits `[ESCALATE]`, including `stall-timeout` for repeated unchanged CI failures. If a Codex goal is active, mark it complete only when one of those terminal conditions is actually satisfied.

11. If the output includes fixes, pushes, rebases, or resolve commands, perform only the instructed scoped actions. Do not resolve, minimize, or dismiss comments until the CLI-provided post-push and `--require-sha` instructions are satisfied.
