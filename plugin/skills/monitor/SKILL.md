---
name: monitor
description: "Start continuous CI monitoring — marks PR ready for review when all checks pass"
argument-hint: "[PR number or URL] [every <interval>] [--ready-delay <duration>]"
user-invocable: true
allowed-tools:
  ["Bash", "Read", "Grep", "Edit", "Write", "Glob", "Skill", "CronCreate", "CronList", "CronDelete"]
---

# pr-shepherd monitor — Continuous PR Monitor

> Action reference (all 8 actions, JSON fields, examples): [docs/actions.md](../../../docs/actions.md)

## Arguments: $ARGUMENTS

## Resolve PR number

1. Strip any trailing `every <N> <unit>` interval clause from `$ARGUMENTS` first.
2. Extract `--ready-delay <duration>` if present (e.g. `--ready-delay 15m`). Default: `10m`. Keep the raw duration string (e.g. `10m`) — do **not** convert to seconds.
3. If the remaining text contains a PR number or GitHub PR URL, extract the number.
4. Otherwise, infer: `gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number --jq '.[0].number'`
5. If no PR found, report an error and stop.

## Start the loop

**Before starting:** List existing cron jobs with `CronList`.

- If any job's prompt contains `# pr-shepherd-loop:pr=<PR_NUMBER>`, **do not cancel+recreate** — perform one iteration now by following the logic in the CronCreate prompt below, then return.

**Run the loop:**

Invoke `/loop <INTERVAL> --max-turns 50 --expires 8h` via the Skill tool. Use the interval from the argument if provided (e.g. `every 30 minutes` → `30m`), otherwise use `4m`. The loop prompt should be:

```
# pr-shepherd-loop:pr=<PR_NUMBER>

**IMPORTANT — recurrence rules:**
- **Do NOT call `ScheduleWakeup` or `/loop`.** This session is fired by a recurring cron job. Either call creates a duplicate runner, causing concurrent git operations and `.git/index.lock` collisions.
- End the turn cleanly after completing the actions below. The cron job handles the next fire.

**Self-dedup:** Run `CronList`. If more than one job contains `# pr-shepherd-loop:pr=<PR_NUMBER>`, keep the lowest job ID and `CronDelete` the rest (ignore errors — a concurrent runner may have already deleted them).

Run in a single Bash call:
  npx pr-shepherd iterate <PR_NUMBER> --ready-delay <READY_DELAY_DURATION> --no-cache --last-push-time "$(git log -1 --format=%ct HEAD)" --format=json

(`<READY_DELAY_DURATION>` is the raw duration string, e.g. `10m` — never a bare number of seconds)

Exit codes 0–3 are all valid — always parse stdout as JSON first. If stdout is not valid JSON (crash), log the first line of stderr and stop.

Act on the `action` field:
- `cooldown` | `wait` | `rerun_ci` | `mark_ready` → print `result.log`
- `cancel`   → print `result.log`, then invoke `/loop cancel` via Skill tool and stop
- `rebase`   → print `result.rebase.reason`, then run `result.rebase.shellScript` in Bash
- `escalate` → print `result.escalate.humanMessage`, then invoke `/loop cancel` via Skill tool and stop
- `fix_code` → follow `result.fix.instructions` in order, then stop this iteration (CI needs time):
  1. Apply code fixes from `fix.threads` and `fix.actionableComments` (Edit/Write tools).
  2. For each `fix.checks[].runId`: `gh run view <runId> --log-failed` — identify and fix the failure.
     If `runId` is null: tell the user to open `detailsUrl` and inspect manually.
  3. Apply changes from `fix.changesRequestedReviews`.
  4. Commit: `git add <files> && git commit -m "<descriptive message>"`
  5. Push: `git fetch origin && git rebase origin/<fix.baseBranch> && git push --force-with-lease` — capture `HEAD_SHA=$(git rev-parse HEAD)`
  6. If `fix.noiseCommentIds` only (no code changes): skip commit/push; omit `--require-sha`.
  7. Run `result.fix.resolveCommand.argv` joined as a shell command, substituting:
     - `$HEAD_SHA` with the pushed SHA (omit `--require-sha` flag entirely if no push occurred)
     - `$DISMISS_MESSAGE` (if present) with one sentence describing the actual fix — never generic text like "address review comments"

```

**Do NOT call ScheduleWakeup** — the cron job handles its own recurrence. Calling ScheduleWakeup with a `/loop` prompt would create a duplicate cron job on the next fire.

The default 4-minute interval is chosen for two reasons:

1. CI checks typically take 2-3 minutes to complete so concurrent agents won't stack.
2. 4 minutes keeps iterations within the 5-minute prompt cache TTL.

## Each iteration

The loop prompt above handles each iteration directly — no subagent is spawned. The same iterate command can be run manually at any time:

```bash
npx pr-shepherd iterate <PR_NUMBER> --ready-delay <READY_DELAY_DURATION> --no-cache --last-push-time "$(git log -1 --format=%ct HEAD)" --format=json
```

To stop monitoring manually, use `/loop cancel` or close the session.

## Handling multiple PRs

To monitor several PRs simultaneously, run `/pr-shepherd:monitor <PR>` once per PR.
Each call creates its own cron job. Before creating a new loop, run `CronList`
to verify a loop for that PR doesn't already exist.
