---
name: check
description: "Check GitHub CI status and review comments for the current PR"
argument-hint: "[PR number or URL ...]"
user-invocable: true
allowed-tools: ["Bash"]
---

# pr-shepherd check — PR Status

## Arguments: $ARGUMENTS

## Resolve PR number(s)

1. If `$ARGUMENTS` contains PR numbers or GitHub PR URLs, extract the number(s).
2. Otherwise, infer: `gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number --jq '.[0].number'`
3. If no PR found, report an error and stop.

For each resolved PR number, check if it is already merged:

```bash
gh pr view <N> --json state --jq '.state'
```

If `MERGED`, output: `PR #N is already merged. Nothing to check.` and skip.

## Run the check

```bash
npx pr-shepherd check <N> --format=json
```

## Reporting

Parse the JSON output and report all three:

- **Merge status** (`report.mergeStatus.status`): CLEAN | BEHIND | CONFLICTS | BLOCKED | UNSTABLE | DRAFT | UNKNOWN — never omit; include `copilotReviewInProgress` when true
- **CI check results** (`report.checks`): passing count, failing names + kinds, in-progress names
- **Unresolved review comments** (`report.threads.actionable` + `report.comments.actionable`): count + details with file paths and line numbers

## Rebase policy

```bash
BASE_BRANCH=$(gh pr view <N> --json baseRefName --jq '.baseRefName')
```

Rebase (`git fetch origin && git rebase origin/<BASE_BRANCH> && git push --force-with-lease`) when:

- Merge conflicts with main (`report.mergeStatus.status == 'CONFLICTS'`), OR
- About to push commits and branch is behind main, OR
- `failureKind == 'flaky'` AND branch is behind main

Do NOT rebase when nothing to push, no conflicts, and no flaky failures.

## CI budget policy

- **actionable**: Summarize errors. Fix in next step.
- **infrastructure**: Re-run: `gh run rerun <runId> --failed`
- **timeout**: Re-run: `gh run rerun <runId> --failed`
- **flaky**: Do NOT cancel. Rebase if behind main.

## Never declare ready to merge

Unless ALL of:

1. `report.mergeStatus.mergeStateStatus == 'CLEAN'`
2. `report.status == 'READY'`
3. `report.mergeStatus.copilotReviewInProgress == false`

This is a one-shot check. For continuous monitoring, use `/pr-shepherd:monitor`.
