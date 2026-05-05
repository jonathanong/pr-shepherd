# shepherd CI checks

[← README](../README.md)

## Classification pipeline

CI check runs flow through three stages: supplement → classify → triage.

### Stage 0: Supplement startup failures (`checks/triage.mts`)

GitHub can complete a workflow run with `conclusion === "startup_failure"` before it creates any job or check-run context. Those runs may be absent from GraphQL `statusCheckRollup`, so Shepherd supplements the GraphQL check list with a REST Actions run query for the PR head SHA:

- `GET /repos/{owner}/{repo}/actions/runs?head_sha=<sha>&status=startup_failure`
- Runs are kept only when the REST `pull_requests` association includes the current PR number and head SHA, because the endpoint is repository-wide for the commit SHA.
- Each returned run is mapped to a `CheckRun` with `conclusion: "STARTUP_FAILURE"`, the run ID, the run URL, the raw event, the workflow name, and `display_title` as `summary`.
- If the same run ID already exists in the GraphQL check list, the startup-failure conclusion updates that entry instead of adding a duplicate.
- The supplement is best-effort. If the Actions runs request fails, Shepherd logs a warning and continues with the GraphQL check data already fetched.

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
- **`failedStep`** — the first step whose conclusion is not `success`, `skipped`, or `neutral` (e.g. a step with `failure` or `timed_out` conclusion).

Checks with `conclusion === "CANCELLED"` or `conclusion === "STARTUP_FAILURE"` short-circuit triage entirely — no jobs API call is made, and `workflowName`/`jobName`/`failedStep` are not populated. Cancelled output carries a `[conclusion: CANCELLED]` tag. Startup-failure output carries a `[conclusion: STARTUP_FAILURE]` tag and may include the workflow run display title as `summary`. The agent runs `gh run view <runId> --log-failed` when it needs the full log for ordinary non-cancelled failures; startup failures use `gh run view <runId>` because failed job logs may not exist.

## Report output

`report.checks` has these fields:

| Field                    | Content                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `passing`                | Classified checks with `category === 'passed'`                                             |
| `failing`                | Triaged failing checks — with `workflowName`, `jobName`, `failedStep` (non-cancelled only) |
| `inProgress`             | Checks with `category === 'in_progress'`                                                   |
| `skipped`                | Checks with `category === 'skipped'`                                                       |
| `filtered`               | Checks excluded by event filter                                                            |
| `filteredNames`          | Names of filtered checks (for reporter display)                                            |
| `blockedByFilteredCheck` | True when BLOCKED state is caused by a filtered check                                      |
