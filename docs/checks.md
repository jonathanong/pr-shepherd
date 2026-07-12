# shepherd CI checks

[← README](../README.md)

## Classification pipeline

CI check runs flow through three stages: supplement → classify → triage.

**Note on cancelled workflows:** when a workflow's concurrency group evicts an in-flight run (a second push, or a second trigger of the same push, cancels the earlier run on the same commit), GitHub leaves behind `CANCELLED` check runs from the evicted run. See "Concurrency-superseded CANCELLED checks" below — these are reclassified as `superseded`, not `failing`.

### Stage 0: Supplement startup failures (`checks/triage.mts`)

GitHub can complete a workflow run with `conclusion === "startup_failure"` before it creates any job or check-run context. Those runs may be absent from GraphQL `statusCheckRollup`, so Shepherd supplements the GraphQL check list with a REST Actions run query for the PR head SHA:

- `GET /repos/{owner}/{repo}/actions/runs?head_sha=<sha>&status=startup_failure`
- Runs are kept only when the REST `pull_requests` association includes the current PR number and head SHA, because the endpoint is repository-wide for the commit SHA.
- Each returned run is mapped to a `CheckRun` with `conclusion: "STARTUP_FAILURE"`, the run ID, the run URL, the raw event, the workflow name, and `display_title` as `summary`.
- If the same run ID already exists in the GraphQL check list, the startup-failure conclusion updates that entry instead of adding a duplicate.
- The supplement is best-effort. If the Actions runs request fails, Shepherd logs a warning and continues with the GraphQL check data already fetched.

### Stage 1: Classify (`checks/classify.mts`)

Each check run is assigned a `CheckCategory`:

| `CheckCategory` | Condition                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `passed`        | `status === 'COMPLETED'` and `conclusion === 'SUCCESS'`                                                                                                            |
| `failing`       | `status === 'COMPLETED'` and `conclusion` in `{FAILURE, TIMED_OUT, CANCELLED, STARTUP_FAILURE, ACTION_REQUIRED}`, and not reclassified as `superseded` (see below) |
| `superseded`    | `conclusion === 'CANCELLED'` and a newer run of the same GitHub Actions workflow exists on the same commit (concurrency-group eviction) — see below                |
| `in_progress`   | `status` in `{IN_PROGRESS, QUEUED, WAITING, PENDING, REQUESTED}`                                                                                                   |
| `skipped`       | `conclusion` in `{SKIPPED, NEUTRAL}` — reported but do not block readiness                                                                                         |
| `ignored`       | Matches `ignoreChecks`, unless the same Actions run is protected by `actions.neverCancelRuns`                                                                      |
| `filtered`      | Triggered by a non-PR event (see event filter below)                                                                                                               |

### Ignore/protection precedence

`ignoreChecks` matches the raw check name (`CheckRun.name` or `StatusContext.context`) and removes matching checks from the CI verdict. For GitHub Actions check runs, `actions.neverCancelRuns` takes precedence when it matches the workflow name or check name for that run. This lets long-running protected workflows remain visible and continue blocking readiness even when one of their raw job names also appears in `ignoreChecks`.

`actions.neverCancelRuns` does not bypass the event filter. A protected workflow triggered by `workflow_dispatch`, `push`, or another non-PR event still needs that event listed in `checks.ciTriggerEvents` if it should count toward readiness.

### Event filter

Only checks triggered by events in `checks.ciTriggerEvents` (default: `pull_request`, `pull_request_target`) count toward the CI verdict. Checks triggered by `push`, `schedule`, `merge_group`, `workflow_dispatch`, or any other event are classified as `filtered`.

Filtered checks appear in `report.checks.filtered` and `report.checks.filteredNames` but do not block the READY verdict. The `blockedByFilteredCheck` flag is set when the merge state is BLOCKED and the only failing checks are filtered ones — this surfaces as a hint in the reporter output.

### Concurrency-superseded CANCELLED checks

GitHub Actions concurrency groups cancel an in-flight workflow run when a newer run of the same workflow starts on the same commit — most commonly when a push fires the workflow twice in quick succession, or a second push lands before the first run finishes. The evicted run's check runs complete with `conclusion === "CANCELLED"`, but GitHub branch protection resolves required status checks by **latest run per name** and merges past them once the newer run's checks pass. Treating every `CANCELLED` check as `failing` would make shepherd block on PRs GitHub itself considers mergeable.

Shepherd groups check runs by workflow — keyed on the Actions workflow's numeric `databaseId` (`workflowId`), falling back to the workflow display name (`workflowName`) when the ID is unavailable — and tracks the highest numeric `runId` seen per workflow. A check is reclassified from `failing` to `superseded` only when **both**:

- its own `conclusion` is `CANCELLED`, and
- some other check sharing its workflow key has a strictly greater `runId`.

This is deliberately narrow:

- Only `CANCELLED` is ever reclassified. A real `FAILURE`/`TIMED_OUT`/`STARTUP_FAILURE` on an older run is never masked, even if a newer run exists (the newer run may not re-emit that check at all, e.g. under path filtering).
- The **newest** run for a workflow is never superseded, even if it is itself cancelled (no newer run exists to supersede it) — that case stays `failing` so the agent can decide whether to rerun.
- Checks with no workflow identity (`workflowId` and `workflowName` both absent) or no numeric `runId` — external `StatusContext` checks, and `STARTUP_FAILURE` synthetics from the Stage 0 supplement — never participate; they can neither be marked superseded nor count as evidence of a newer run.

`superseded` checks are excluded from `getCiVerdict`'s `relevant` tally (same as `filtered`/`skipped`/`ignored`) and from `report.checks.failing` — they are never triaged (no jobs/logs API call) and never appear under `## Failing checks`. They are surfaced only as a `supersededNames` list for transparency.

### Empty-check set

When all checks are filtered or skipped (e.g., docs-only PRs that only trigger push checks), `getCiVerdict` returns `allPassed: true`. This prevents shepherd from blocking READY on PRs that have no relevant CI.

### `getCiVerdict`

Returns:

- `anyFailing` — true if any non-filtered, non-superseded check is in the `failing` category
- `anyInProgress` — true if any non-filtered, non-superseded check is in the `in_progress` category
- `allPassed` — true if no failing and no in-progress relevant checks
- `filteredNames` — names of filtered checks
- `ignoredNames` — names of checks suppressed by `ignoreChecks`
- `supersededNames` — names of `CANCELLED` checks reclassified as `superseded`

## Stage 2: Triage (`checks/triage.mts`)

For each failing check, triage fetches additional context from the GitHub Actions API:

- **`workflowName`** — the workflow that owns the failing job (from `jobs?filter=latest`).
- **`jobName`** — the name of the matched job (falls back to the check name when not available).
- **`failedStep`** — the first step whose conclusion is not `success`, `skipped`, or `neutral` (e.g. a step with `failure` or `timed_out` conclusion).
- **`logExcerpt`** — bounded failure context from the matched failed job log, fetched from `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs`. For aggregate jobs that print a `Job results` JSON block, Shepherd emits the non-success job results plus the exit-code/error line. Otherwise it prefers lines around errors and falls back to the final non-empty lines. The fetch is best-effort; missing or inaccessible logs leave the field omitted.
- **`annotations`** — marker-gated inline annotations from failing `CheckRun` checks. Annotation `message` and `rawDetails` fields are capped independently before text and JSON output.

Checks with `conclusion === "CANCELLED"` or `conclusion === "STARTUP_FAILURE"` short-circuit triage entirely — no jobs/logs API call is made, and `workflowName`/`jobName`/`failedStep`/`logExcerpt` are not populated. Cancelled output carries a `[conclusion: CANCELLED]` tag. Startup-failure output carries a `[conclusion: STARTUP_FAILURE]` tag and may include the workflow run display title as `summary`. The agent reads any included `logExcerpt` first and runs `gh run view <runId> --log-failed` when it needs the full log for ordinary non-cancelled failures; startup failures use `gh run view <runId>` because failed job logs may not exist.

## Report output

`report.checks` has these fields:

| Field                    | Content                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `passing`                | Classified checks with `category === 'passed'`                                                                                |
| `failing`                | Triaged failing checks — with `workflowName`, `jobName`, `failedStep`, `logExcerpt` (non-cancelled, non-startup-failure only) |
| `inProgress`             | Checks with `category === 'in_progress'`                                                                                      |
| `skipped`                | Checks with `category === 'skipped'`                                                                                          |
| `filtered`               | Checks excluded by event filter                                                                                               |
| `filteredNames`          | Names of filtered checks (for reporter display)                                                                               |
| `blockedByFilteredCheck` | True when BLOCKED state is caused by a filtered check                                                                         |
| `ignoredNames`           | Names of checks suppressed by `ignoreChecks`; omitted when empty                                                              |
| `supersededNames`        | Names of `CANCELLED` checks reclassified as `superseded`; omitted when empty                                                  |

Pending CI checks also carry raw timing when GitHub exposes it:

- `source` — `check_run`, `status_context`, or `startup_failure`.
- `createdAtUnix` — check-suite/workflow-run creation time for check runs, or status-context creation time for external statuses.
- `startedAtUnix` — check-run start time when present.
- `updatedAtUnix` — check-suite/workflow-run update time when present.

Iterate uses these raw fields to escalate with `stall-timeout` when relevant CI remains pending/unstarted longer than `iterate.stallTimeoutMinutes`.
