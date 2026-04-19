---
name: monitor
description: "Start continuous CI monitoring — marks PR ready for review when all checks pass"
argument-hint: "[PR number or URL] [every <interval>] [--ready-delay <duration>]"
user-invocable: true
allowed-tools:
  ["Bash", "Read", "Grep", "Edit", "Write", "Glob", "Skill", "CronCreate", "CronList", "CronDelete"]
---

# pr-shepherd monitor — Continuous PR Monitor

## Arguments: $ARGUMENTS

## Resolve PR number

1. Strip any trailing `every <N> <unit>` interval clause from `$ARGUMENTS` first.
2. Extract `--ready-delay <duration>` if present (e.g. `--ready-delay 15m`). Default: `10m`.
3. If the remaining text contains a PR number or GitHub PR URL, extract the number.
4. Otherwise, infer: `gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number --jq '.[0].number'`
5. If no PR found, report an error and stop.

## Detect base branch

```bash
BASE_BRANCH=$(gh pr view <PR_NUMBER> --json baseRefName --jq '.baseRefName')
```

Default to `main` if the command fails.

## Start the loop

**Before starting:** List existing cron jobs with `CronList`.

- If any job's prompt contains `# pr-shepherd-loop:pr=<PR_NUMBER>`, **do not cancel+recreate** — perform one iteration now by following the logic in the CronCreate prompt below, then return.

**Run the loop:**

Invoke `/loop <INTERVAL> --max-turns 50 --expires 8h` via the Skill tool. Use the interval from the argument if provided (e.g. `every 30 minutes` → `30m`), otherwise use `4m`. The loop prompt should be:

````
# pr-shepherd-loop:pr=<PR_NUMBER>
Run the following in a single Bash invocation (dangerouslyDisableSandbox: true):
  npx pr-shepherd iterate <PR_NUMBER> --ready-delay <READY_DELAY> --no-cache --last-push-time "$(git log -1 --format=%ct HEAD)" --format=json

Exit codes 0, 1, 2, and 3 are all valid signals — always try to parse stdout as JSON first. If the command exits non-zero and stdout is not parseable JSON (e.g. a crash), log the first line of stderr and continue (do not cancel the loop).

Parse the `action` field and act:

- `cooldown` → log: `SKIP: CI still starting`
- `wait` → log: `WAIT: <summary.passing> passing, <summary.inProgress> in-progress (merge state: <mergeStateStatus>, <remainingSeconds>s cooldown remaining)`
- `rerun_ci` → log: `RERAN <N> CI checks: <reran joined by space>`
- `mark_ready` → log: `MARKED READY: PR <pr>`
- `cancel` → invoke `/loop cancel` and stop
- `rebase` → run (dangerouslyDisableSandbox: true):
  ```bash
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "SKIP rebase: dirty worktree (uncommitted changes present)"
    exit 0
  fi
  git fetch origin && git rebase origin/<BASE_BRANCH> && git push --force-with-lease
  ```

- `escalate` → invoke `/loop cancel` via Skill tool, then print:

  ⚠️ /pr-shepherd:monitor paused — needs human direction

  Triggers: <escalate.triggers joined by ", ">
  <escalate.suggestion>

  Items needing attention:
  <for each thread in escalate.unresolvedThreads: "- threadId=<id> <path ?? '(no location)'>:<line ?? '?'> (@<author>): <body first line>">
  <if escalate.changesRequestedReviews.length > 0: for each "- reviewId=<id> (@<author>): <body first line>">
  <if escalate.attemptHistory: "Fix attempts: " + each "threadId=<id> attempted <N> times">

  Run /pr-shepherd:check <PR> to see current state.
  After fixing manually, rerun /pr-shepherd:monitor <PR> to resume.

- `fix_code` → do the following, then stop this iteration (CI needs time):
  1. For each item in `fix.threads` and `fix.comments`: read the referenced file/line and apply the fix (Edit/Write tools).
  2. For each item in `fix.checks`:
     - If `runId` is non-null: fetch the failure log with `gh run view <runId> --log-failed` (dangerouslyDisableSandbox: true), scan the output to identify the failure (e.g. grep for `FAIL` for test failures, `error:` for type/compile errors, lint rule names for lint failures), then read the relevant file and apply the fix (Edit/Write tools).
     - If `runId` is null: the failed check is an external status check that cannot be inspected via run logs. Escalate — tell the user to open `detailsUrl` in the PR checks UI, inspect the failure manually, and rerun `/pr-shepherd:monitor 13` after addressing it. Do not attempt to fix these automatically.
  3. For each item in `fix.changesRequestedReviews`: read the review body and apply the requested changes.
  4. If files were changed, `git add <files> && git commit -m "<appropriate commit message>"`
  5. `git fetch origin && git rebase origin/<BASE_BRANCH> && git push --force-with-lease` (dangerouslyDisableSandbox: true)
  6. `HEAD_SHA=$(git rev-parse HEAD)`
  7. `npx pr-shepherd resolve <PR_NUMBER> --resolve-thread-ids <IDs> --minimize-comment-ids <IDs> --dismiss-review-ids <IDs> --message "address review comments" --require-sha "$HEAD_SHA"` (dangerouslyDisableSandbox: true). Omit any flag whose ID list is empty.

````

**Do NOT call ScheduleWakeup** — the cron job handles its own recurrence. Calling ScheduleWakeup with a `/loop` prompt would create a duplicate cron job on the next fire.

The default 4-minute interval is chosen for two reasons:

1. CI checks typically take 2-3 minutes to complete so concurrent agents won't stack.
2. 4 minutes keeps iterations within the 5-minute prompt cache TTL.

## Each iteration

The loop prompt above handles each iteration directly — no subagent is spawned. The same iterate command can be run manually at any time:

```bash
npx pr-shepherd iterate <PR_NUMBER> --ready-delay <READY_DELAY> --no-cache --last-push-time "$(git log -1 --format=%ct HEAD)" --format=json
```

To stop monitoring manually, use `/loop cancel` or close the session.

## Handling multiple PRs

To monitor several PRs simultaneously, run `/pr-shepherd:monitor <PR>` once per PR.
Each call creates its own cron job. Before creating a new loop, run `CronList`
to verify a loop for that PR doesn't already exist.
