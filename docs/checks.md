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

Failing checks are further classified by `FailureKind`:

| `FailureKind` | Condition                                                         |
| ------------- | ----------------------------------------------------------------- |
| `timeout`     | `conclusion === 'TIMED_OUT'`                                      |
| `cancelled`   | `conclusion === 'CANCELLED'`, `'STARTUP_FAILURE'`, or `'STALE'`   |
| `actionable`  | Everything else — code failures, type errors, lint, test failures |

For `actionable` checks, triage calls the GitHub Actions jobs API (the same `jobs?filter=latest` endpoint) to find the name of the first failed step (e.g. `"Run tests"`, `"Set up job"`). This `failedStep` is returned as part of the check and is visible in both JSON and text output. No log fetching is done for `timeout` or `cancelled` checks.

## Report output

`report.checks` has these fields:

| Field                    | Content                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `passing`                | Classified checks with `category === 'passed'`               |
| `failing`                | Triaged failing checks (with `failureKind` and `failedStep`) |
| `inProgress`             | Checks with `category === 'in_progress'`                     |
| `skipped`                | Checks with `category === 'skipped'`                         |
| `filtered`               | Checks excluded by event filter                              |
| `filteredNames`          | Names of filtered checks (for reporter display)              |
| `blockedByFilteredCheck` | True when BLOCKED state is caused by a filtered check        |
