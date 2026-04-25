# shepherd CI checks

[← README](../README.md)

## Classification pipeline

CI check runs flow through two stages: classify → triage.

### Stage 1: Classify (`checks/classify.mts`)

Each check run is assigned a `CheckCategory`:

| `CheckCategory` | Condition                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `passed`        | `status === 'COMPLETED'` and `conclusion === 'SUCCESS'`                                                          |
| `failing`       | `status === 'COMPLETED'` and `conclusion` in `{FAILURE, TIMED_OUT, CANCELLED, STARTUP_FAILURE, ACTION_REQUIRED}` |
| `in_progress`   | `status` in `{IN_PROGRESS, QUEUED, WAITING, PENDING, REQUESTED}`                                                 |
| `skipped`       | `conclusion` in `{SKIPPED, NEUTRAL}` — reported but do not block readiness                                       |
| `filtered`      | Triggered by a non-PR event (see event filter below)                                                             |

### Event filter

Only checks triggered by events in `checks.ciTriggerEvents` (default: `pull_request`, `pull_request_target`) count toward the CI verdict. Checks triggered by `push`, `schedule`, `merge_group`, `workflow_dispatch`, or any other event are classified as `filtered`.

Filtered checks appear in `report.checks.filtered` and `report.checks.filteredNames` but do not block the READY verdict. The `blockedByFilteredCheck` flag is set when the merge state is BLOCKED and the only failing checks are filtered ones — this surfaces as a hint in the reporter output.

### Empty-check set

When all checks are filtered or skipped (e.g., docs-only PRs that only trigger push checks), `getCiVerdict` returns `allPassed: true`. This prevents shepherd from blocking READY on PRs that have no relevant CI.

### `getCiVerdict`

Returns:

- `anyFailing` — true if any non-filtered check is in the `failing` category
- `anyInProgress` — true if any non-filtered check is in the `in_progress` category
- `allPassed` — true if no failing and no in-progress non-filtered checks
- `filteredNames` — names of filtered checks

## Stage 2: Triage (`checks/triage.mts`)

For each failing check, triage fetches additional context from the GitHub Actions API:

- **`workflowName`** — the workflow that owns the failing job (from `jobs?filter=latest`).
- **`jobName`** — the name of the matched job (falls back to the check name when not available).
- **`failedStep`** — the first step whose conclusion is not `success`, `skipped`, or `neutral` (e.g. a step with `failure`, `timed_out`, or `cancelled` conclusion).
- **`logTail`** — the last `checks.logTailLines` (default 80) lines of the failing job's log (after stripping runner setup boilerplate), fetched via `GET /repos/{owner}/{repo}/actions/jobs/{jobId}/logs` (follows a redirect to the raw log text).

All fields are populated unconditionally when available; none are gated on the type of failure. The agent reads `logTail` to decide whether to rerun (transient failure) or fix (real failure). `logTail` is omitted when the log fetch fails or when the check has no run ID.

## Report output

`report.checks` has these fields:

| Field                    | Content                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| `passing`                | Classified checks with `category === 'passed'`                                   |
| `failing`                | Triaged failing checks — with `workflowName`, `jobName`, `failedStep`, `logTail` |
| `inProgress`             | Checks with `category === 'in_progress'`                                         |
| `skipped`                | Checks with `category === 'skipped'`                                             |
| `filtered`               | Checks excluded by event filter                                                  |
| `filteredNames`          | Names of filtered checks (for reporter display)                                  |
| `blockedByFilteredCheck` | True when BLOCKED state is caused by a filtered check                            |
