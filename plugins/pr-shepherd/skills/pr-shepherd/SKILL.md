---
name: pr-shepherd
description: Codex-only skill for checking, updating, monitoring, or resolving a GitHub pull request with pr-shepherd. Use for requests like "check this PR", "use pr-shepherd", "iterate PR #123", "resolve this PR's comments", or "run pr-shepherd until this PR is ready". For open-ended requests, create a Codex goal and run explicit `npx --no-install pr-shepherd iterate PR_NUMBER` cycles every configured interval until Shepherd emits `[CANCEL]` for ready-delay completion or merged/closed, or `[ESCALATE]` including repeated unchanged CI failures.
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
   - For requests such as "continue", "until ready", "until this PR is ready", or "keep iterating", create a Codex goal before the first iterate cycle with this objective:
     `Run npx --no-install pr-shepherd iterate PR_NUMBER cycles every configured interval until Shepherd emits [CANCEL] for ready-delay completion or PR #PR_NUMBER is merged/closed, or pr-shepherd escalates, including repeated unchanged CI failures.`

3. Verify the CLI is available.
   - In the pr-shepherd source checkout, before any `npx --no-install pr-shepherd` invocation, verify `bin/` and `node_modules/` exist. If either is missing, run:
     `npm install`
   - In other repositories, use `npx --no-install pr-shepherd` so Codex does not install packages implicitly. If that fails because the package is missing, tell the user to install `pr-shepherd` in the target repo with `npm install --save-dev pr-shepherd`.

4. Run the appropriate command from the repository root.
   - For a status check:
     `npx --no-install pr-shepherd check PR_NUMBER`
   - For review comment resolution:
     `npx --no-install pr-shepherd resolve PR_NUMBER --fetch`
   - For a monitor bootstrap:
     `npx --no-install pr-shepherd monitor PR_NUMBER`
   - For an explicit monitor tick:
     `npx --no-install pr-shepherd iterate PR_NUMBER`

5. Print or summarize the important status, then follow the output's `## Instructions` exactly.

6. Do not call `/loop`, `ScheduleWakeup`, `CronCreate`, or `npx pr-shepherd monitor` for recurrence. Codex does explicit `iterate` commands.

7. For open-ended goal requests, complete the CLI-provided instructions for the current cycle. If the output says to continue the active Codex goal, wait for the configured interval named in the output and run another explicit `iterate` cycle.

8. Do not stop an open-ended goal only because the output is `[WAIT]`, `[COOLDOWN]`, `[MARK_READY]`, or a post-fix CI wait. These are nonterminal Codex recurrence states.

9. Stop only when Shepherd emits `[CANCEL]` for ready-delay completion or merged/closed, or when it emits `[ESCALATE]`, including `stall-timeout` for repeated unchanged CI failures. If a Codex goal is active, mark it complete only when one of those terminal conditions is actually satisfied.

10. If the output includes fixes, pushes, rebases, or resolve commands, perform only the instructed scoped actions. Do not resolve, minimize, or dismiss comments until the CLI-provided post-push and `--require-sha` instructions are satisfied.
