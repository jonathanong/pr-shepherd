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

### BLOCKED + REVIEW_REQUIRED → ShepherdStatus READY

`deriveMergeStatus` sets `status: "BLOCKED"` whenever `mergeStateStatus` is `BLOCKED`. However, `computeStatus` in `check.mts` overrides this to `ShepherdStatus: "READY"` when all of the following are true:

- `verdict.allPassed` — no failing or in-progress CI checks.
- No unresolved threads, comments, or changes-requested reviews.
- `mergeStatus.status === "BLOCKED"` (from `deriveMergeStatus`).
- `mergeStatus.copilotReviewInProgress === false` — bot review pending means the blocking reason is not solely a human.
- `mergeStatus.reviewDecision === "REVIEW_REQUIRED"` — explicitly awaiting human approval.

In this case `mergeStatus.status` in the report is still `BLOCKED` (truthful about the GitHub merge state), but the top-level `ShepherdStatus` is `READY`, signalling that shepherd has nothing more to do. The ready-delay timer starts, and `action: cancel` is emitted after it elapses.

Any `BLOCKED` case that does not satisfy all of the above conditions (e.g. Copilot review in progress, unresolved threads, or `reviewDecision` is null) maps to `ShepherdStatus: "PENDING"` rather than `"FAILING"`. The same applies to `UNSTABLE` (non-required checks are red but merge is not fully blocked) and `BEHIND` (head branch is out of date). `FAILING` is reserved for red CI checks (`verdict.anyFailing`) and merge conflicts (`CONFLICTS`).

## Copilot detection

`detectCopilotReview(pr)` returns true when:

1. Any `reviewRequest` has a login starting with `"copilot"` (case-insensitive), OR
2. Any `latestReview` has a login starting with `"copilot"` AND `state === 'PENDING'`

A completed Copilot review (APPROVED or CHANGES_REQUESTED) does not set `copilotReviewInProgress`.
