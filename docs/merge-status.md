# shepherd merge-status derivation

[← README](../README.md) | [context.md](context.md)

This page is the mergeability and merge-requirements spec — part of **context gathering**. Shepherd derives a merge discriminator for the state machine, then prints current-vs-required merge rules so the agent can see why GitHub will or will not merge. It does not merge PRs.

## `deriveMergeStatus` — first-match-wins table

Located in `src/merge-status/derive.mts`. Given a `BatchPrData`, returns a `MergeStatusResult`.

| Priority | Condition                                         | Status         | Notes                                                                          |
| -------- | ------------------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| 0        | `state !== 'OPEN'`                                | (pass through) | `runCheck` returns top-level `MERGED`/`CLOSED`; derived merge status stays raw |
| 1        | `mergeable === 'CONFLICTING'`                     | `CONFLICTS`    | GraphQL merge conflict signal                                                  |
| 2        | `blockingBotReviewInProgress`                     | `BLOCKED`      | Takes priority over BEHIND to avoid hiding a real blocker                      |
| 3        | `mergeStateStatus === 'DIRTY'`                    | `CONFLICTS`    | REST-layer merge conflict signal                                               |
| 4        | `isDraft` or `mergeStateStatus === 'DRAFT'`       | `DRAFT`        | Draft wins over BEHIND / BLOCKED / UNSTABLE                                    |
| 5        | `mergeStateStatus === 'BEHIND'`                   | `BEHIND`       | Branch needs rebase; status information, not a rebase                          |
| 6        | `mergeStateStatus === 'BLOCKED'` or `'HAS_HOOKS'` | `BLOCKED`      | Protected branch rules blocking merge                                          |
| 7        | `mergeStateStatus === 'UNSTABLE'`                 | `UNSTABLE`     | Some checks not passing                                                        |
| 8        | `mergeStateStatus === 'UNKNOWN'`                  | `UNKNOWN`      | GitHub hasn't computed merge state yet                                         |
| 9        | (fallthrough)                                     | `CLEAN`        | Ready to merge                                                                 |

A draft that is also behind is `DRAFT`, not `BEHIND`.

## Merge requirements

After each sweep, `deriveMergeRequirements` (`src/merge-status/requirements.mts`) folds classic branch protection and the PR's applicable rulesets together with current PR state. Iterate prints that snapshot. JSON lives on `mergeRequirements`; text is formatted by `src/merge-status/requirements-format.mts`.

Always printed:

| Text                                         | JSON                                                             | Meaning                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Approvals: None [Not Required]`             | `approvals: { current, requiredCount }`                          | Current APPROVED reviews vs required count. `[Required]` only when `requiredCount > 0`. |
| `Conversations Resolved: Yes [Not Required]` | `conversationsResolved: { resolved, unresolvedCount, required }` | Unresolved thread count vs `requiresConversationResolution`.                            |

Printed only when they apply:

| Text                                    | JSON field                         | When                                                                                      |
| --------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `Code owner review: [Required]`         | `codeOwnerReview`                  | `requiresCodeOwnerReviews`                                                                |
| `Last-push approval: [Required]`        | `lastPushApproval`                 | `requiresLastPushApproval`                                                                |
| `Signed commits: [Required]`            | `signedCommits`                    | `requiresCommitSignatures`                                                                |
| `Linear history: [Required]`            | `linearHistory`                    | `requiresLinearHistory`                                                                   |
| `Branch up to date: Yes\|No [Required]` | `branchUpToDate`                   | **Only** when `requiresStrictStatusChecks`. `current` is `mergeStateStatus !== "BEHIND"`. |
| `Required status checks: N [Required]`  | `requiredStatusChecks.contexts`    | Non-empty required contexts                                                               |
| `Required deployments: … [Required]`    | `requiredDeployments.environments` | Non-empty environments                                                                    |
| `Required workflows: [Required]`        | `requiredWorkflows`                | `requiresWorkflows`                                                                       |
| `Code scanning: [Required]`             | `codeScanning`                     | `requiresCodeScanning`                                                                    |
| `Merge queue: …`                        | `mergeQueue`                       | Required, enabled, or already in queue                                                    |
| `Stack: #<n> <pos>/<size> (base <ref>)` | `stack`                            | GitHub stack membership                                                                   |

The agent should read these lines instead of inferring a required review from `reviewDecision`. `REVIEW_REQUIRED` with `Approvals: None [Not Required]` means GitHub is not waiting on an approval.

`stack` is not display-only: when `--merge` is enabled and the clean READY state has lasted for the configured ready-delay, a present `stack` field diverts that tick to `ESCALATE` (`stacked-pr`) instead of a merge command, at every stack position including 1 — see [escalations.md#stacked-pr](escalations.md#stacked-pr). GitHub's stack field is public preview and can be absent for a genuinely stacked PR; an absent field means Shepherd has no signal, not that the PR is confirmed unstacked.

`reviewDecision` is **not** used for ShepherdStatus derivation. Iterate still prints why merge is blocked: cancel notes use `blockedReasonFromRequirements` (awaiting N approvals, unresolved conversations, branch behind base, merge queue) rather than guessing from `reviewDecision` alone.

Tests that construct an iterate result without a sweep (no `mergeRequirements`) still get a fallback `**required**` line listing names from `requiredStatusCheckContexts`. Live iterate output uses `mergeRequirements` and does not emit that `**required**` line.

## Gotchas

### DIRTY vs CONFLICTING

These are two different signals for the same underlying condition (merge conflicts):

- `mergeable === 'CONFLICTING'` — GraphQL's signal. Available when GitHub has computed the merge state for the GraphQL response.
- `mergeStateStatus === 'DIRTY'` — REST API's signal. The `getMergeableState` REST fallback can return `DIRTY` when GraphQL returns `UNKNOWN`.

Both map to `CONFLICTS` in shepherd's derived status.

`runCheck` also refreshes mergeability for candidate READY states. This catches short-lived GraphQL lag where the batch query still reports `CLEAN` but the REST pull-request endpoint already reports `DIRTY`; in that case the refreshed value maps to `CONFLICTS` before iterate can complete ready-delay. The same already-required REST response refreshes the PR state, so a merge or close that races the initial GraphQL snapshot cancels the tick without adding another API request.

### Terminal PRs use state, not mergeability

GitHub often reports `mergeable: UNKNOWN` and `mergeStateStatus: UNKNOWN` after a PR is merged or closed. Shepherd treats `state` as authoritative for those PRs: `runCheck` returns top-level `status: "MERGED"` or `status: "CLOSED"` and skips CI/comment processing, while `deriveMergeStatus` continues to pass through the raw `state` and derived mergeability fields.

`state` is used by iterate at step **1.5** to cancel the loop for terminal PRs. The merge status derivation logic itself does not branch on `state`.

### Blocking-bot detection takes priority over BEHIND

Priority 2 (`blockingBotReviewInProgress`) comes before priority 5 (BEHIND). If a blocking bot review is pending AND the branch is behind, shepherd reports `BLOCKED`, not `BEHIND`. This prevents the loop from treating the PR as a rebase problem while the bot is still reviewing — a rebase would dismiss the in-progress review.

### DRAFT uses both `isDraft` and `mergeStateStatus === 'DRAFT'`

GitHub sometimes updates `mergeStateStatus` to `'DRAFT'` before the `isDraft` boolean is reflected in the GraphQL response. Checking both fields ensures the DRAFT status is caught. Because DRAFT is priority 4, a draft that is also behind, blocked, or unstable reports `DRAFT`.

### BLOCKED or UNSTABLE with no remaining shepherd work → ShepherdStatus READY

`deriveMergeStatus` sets `status: "BLOCKED"` whenever `mergeStateStatus` is `BLOCKED`. However, `computeStatus` in `src/commands/check-status.mts` overrides this to `ShepherdStatus: "READY"` when all of the following are true:

- `verdict.allPassed` — no failing or in-progress CI checks.
- Relevant passing checks exist: `verdict.hasChecks`, **or** `mergeStatus.status === "UNSTABLE"` with at least one ignored check. The UNSTABLE+ignored case is a safe READY state even with no other checks, because UNSTABLE means only non-required checks are pending/failing. BLOCKED is excluded from that ignored-names extension: BLOCKED can mean required checks have not started.
- No unresolved threads, comments, or changes-requested reviews. This includes outdated/minimized threads that still have `isResolved === false`; those are routed as resolution-only work instead of being treated as ready.
- `mergeStatus.status === "BLOCKED"` or `"UNSTABLE"`.
- `mergeStatus.blockingBotReviewInProgress === false` — a bot review still pending is Shepherd work, not a READY case.

In this case `mergeStatus.status` in the report is still `BLOCKED` or `UNSTABLE` (truthful about the GitHub merge state), but the top-level `ShepherdStatus` is `READY`, signalling that shepherd has nothing more to do. The ready-delay timer starts, and `action: cancel` is emitted after it elapses.

A `BLOCKED` case that does not satisfy the above (blocking bot review in progress, unresolved threads, or failing CI) maps to `ShepherdStatus: "PENDING"`. The same applies to `BEHIND` (head branch is out of date) when it is not a READY state. `FAILING` is reserved for red CI checks (`verdict.anyFailing`) and merge conflicts (`CONFLICTS`).

## Blocking-bot review detection

`detectBlockingBotReview(pr)` returns true when:

1. Any `reviewRequest` has a login starting with one of the configured `mergeStatus.blockingReviewerLogins` prefixes (case-insensitive), OR
2. Any `latestReview` has a matching login AND `state === 'PENDING'`

A completed review (APPROVED or CHANGES_REQUESTED) does not set `blockingBotReviewInProgress`. The logins to treat as blocking bots are configured via `mergeStatus.blockingReviewerLogins` in `.pr-shepherdrc.yml` (default: `["copilot"]`).
