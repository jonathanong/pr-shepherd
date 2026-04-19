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

The CLI already determines whether a rebase is warranted. Read `report.mergeStatus.status` directly:

- `CONFLICTS` — a rebase is required to resolve the merge conflict before the PR can land.
- `BEHIND` — a rebase may be appropriate; a `flaky` failure while `BEHIND` is the canonical rebase signal. If all checks pass but the PR is `BEHIND`, a rebase is optional.
- Any other status — no rebase needed.

Do not re-derive these conditions from raw branch state. For automated monitoring that acts on these signals, use `/pr-shepherd:monitor` — it handles rebase decisions end-to-end.

## CI budget policy

Each entry in `report.checks` carries a `failureKind` field. Read it directly rather than re-classifying failures:

- `actionable` — the failure is code-level and needs a fix.
- `infrastructure` — transient infra problem; re-run with `gh run rerun <runId> --failed`.
- `timeout` — job exceeded the time limit; re-run with `gh run rerun <runId> --failed`.
- `flaky` — known-flaky test; do NOT cancel. Rebase first if `mergeStatus.status` is `BEHIND`.

## Never declare ready to merge

Unless ALL of:

1. `report.mergeStatus.mergeStateStatus == 'CLEAN'`
2. `report.status == 'READY'`
3. `report.mergeStatus.copilotReviewInProgress == false`

This is a one-shot check. For continuous monitoring, use `/pr-shepherd:monitor`.
