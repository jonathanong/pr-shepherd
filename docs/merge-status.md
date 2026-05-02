# shepherd merge-status derivation

[← README](../README.md)

## `deriveMergeStatus` — first-match-wins table

Located in `src/merge-status/derive.mts`. Given a `BatchPrData`, returns a `MergeStatusResult`.

| Priority | Condition                                         | Status         | Notes                                                                      |
| -------- | ------------------------------------------------- | -------------- | -------------------------------------------------------------------------- |
| 0        | `state !== 'OPEN'`                                | (pass through) | `iterate` cancels loop at step 2.5; status field is still derived normally |
| 1        | `mergeable === 'CONFLICTING'`                     | `CONFLICTS`    | GraphQL merge conflict signal                                              |
| 2        | `copilotReviewInProgress`                         | `BLOCKED`      | Takes priority over BEHIND to avoid hiding a real blocker                  |
| 3        | `mergeStateStatus === 'DIRTY'`                    | `CONFLICTS`    | REST-layer merge conflict signal                                           |
| 4        | `mergeStateStatus === 'BEHIND'`                   | `BEHIND`       | Branch needs rebase                                                        |
| 5        | `mergeStateStatus === 'BLOCKED'` or `'HAS_HOOKS'` | `BLOCKED`      | Protected branch rules blocking merge                                      |
| 6        | `mergeStateStatus === 'UNSTABLE'`                 | `UNSTABLE`     | Some checks not passing                                                    |
| 7        | `isDraft` or `mergeStateStatus === 'DRAFT'`       | `DRAFT`        | Draft PR state                                                             |
| 8        | `mergeStateStatus === 'UNKNOWN'`                  | `UNKNOWN`      | GitHub hasn't computed merge state yet                                     |
| 9        | (fallthrough)                                     | `CLEAN`        | Ready to merge                                                             |

## Gotchas

### DIRTY vs CONFLICTING

These are two different signals for the same underlying condition (merge conflicts):

- `mergeable === 'CONFLICTING'` — GraphQL's signal. Available when GitHub has computed the merge state for the GraphQL response.
- `mergeStateStatus === 'DIRTY'` — REST API's signal. The `getMergeableState` REST fallback can return `DIRTY` when GraphQL returns `UNKNOWN`.

Both map to `CONFLICTS` in shepherd's derived status.

### Copilot detection takes priority over BEHIND

Priority 2 (copilot) comes before priority 4 (BEHIND). If a Copilot review is pending AND the branch is behind, shepherd reports `BLOCKED`, not `BEHIND`. This prevents the loop from rebasing and pushing when Copilot is still reviewing — the rebase would dismiss the in-progress review.

### DRAFT uses both `isDraft` and `mergeStateStatus === 'DRAFT'`

GitHub sometimes updates `mergeStateStatus` to `'DRAFT'` before the `isDraft` boolean is reflected in the GraphQL response (timing inconsistency). Checking both fields ensures the DRAFT status is caught reliably.

### `state` pass-through

`state` (OPEN/MERGED/CLOSED) is passed through directly from `BatchPrData` without any transformation. It is used by `iterate.mts` at step 2.5 to cancel the loop for terminal PRs. The merge status derivation logic itself does not branch on `state` — it always derives a `status` regardless of PR state.

### BLOCKED + no remaining shepherd work → ShepherdStatus READY

`deriveMergeStatus` sets `status: "BLOCKED"` whenever `mergeStateStatus` is `BLOCKED`. However, `computeStatus` in `check.mts` overrides this to `ShepherdStatus: "READY"` when all of the following are true:

- `verdict.allPassed` — no failing or in-progress CI checks.
- `verdict.hasChecks` — at least one relevant (non-filtered, non-skipped) check has completed. Prevents a PR with zero relevant checks (CI never started, or all checks filtered/skipped) from prematurely triggering READY before any check has reported.
- No unresolved threads, comments, or changes-requested reviews. This includes outdated/minimized threads that still have `isResolved === false`; those are routed as resolution-only work instead of being treated as ready.
- `mergeStatus.status === "BLOCKED"` (from `deriveMergeStatus`).
- `mergeStatus.copilotReviewInProgress === false` — a bot review still pending is shepherd's problem, not a hand-off case.

The specific reason GitHub is BLOCKED (`reviewDecision === "REVIEW_REQUIRED"`, `"APPROVED"` with insufficient approvals, signed-commit policy, etc.) is not consulted — it is informational only, surfaced in the iterate output for human/agent readers but not used to gate state. Shepherd cannot resolve any of these on its own.

In this case `mergeStatus.status` in the report is still `BLOCKED` (truthful about the GitHub merge state), but the top-level `ShepherdStatus` is `READY`, signalling that shepherd has nothing more to do. The ready-delay timer starts, and `action: cancel` is emitted after it elapses.

A `BLOCKED` case that does not satisfy the above (e.g. Copilot review in progress, unresolved threads, or failing CI) maps to `ShepherdStatus: "PENDING"`. The same applies to `UNSTABLE` (non-required checks are red but merge is not fully blocked) and `BEHIND` (head branch is out of date). `FAILING` is reserved for red CI checks (`verdict.anyFailing`) and merge conflicts (`CONFLICTS`).

## Copilot detection

`detectCopilotReview(pr)` returns true when:

1. Any `reviewRequest` has a login starting with `"copilot"` (case-insensitive), OR
2. Any `latestReview` has a login starting with `"copilot"` AND `state === 'PENDING'`

A completed Copilot review (APPROVED or CHANGES_REQUESTED) does not set `copilotReviewInProgress`.
