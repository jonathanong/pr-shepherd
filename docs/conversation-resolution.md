# Conversation resolution and human inline threads

[← README](../README.md) | [comments.md](comments.md) | [escalations.md](escalations.md)

GitHub can require every review thread to be resolved before merge. Shepherd already replies to human inline threads. It resolves them only for the authenticated viewer's own threads, and for other humans when [`iterate.resolveOtherHumanThreads`](configuration.md#iterateresolveotherhumanthreads) says so. That enum does not read the branch rule.

Requested policy, not implemented:

- When the base branch requires conversation resolution, reply to every human inline thread and resolve it once a Shepherd reply is in place. That is the viewer-authored pairing: reply and resolve in one `apply review` command, then a resolve-only retry when the marker is already present and the thread is still open.
- When the base branch does not require conversation resolution, keep today's enum.
- When the next step is a decision Shepherd cannot make, `ESCALATE`.

The matrices below are the current behavior, then that requested policy against the same rows.

## What "human inline" means

A row is one GitHub review thread (`pullRequest.reviewThreads`), which is the unit conversation resolution blocks on. The class is the original inline comment. Later replies do not move the thread into another class. `viewerDidAuthor: true` is read from that original comment.

| Class           | Predicate                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Detected bot    | `authorType: Bot`, a login containing `[bot]`, or a login listed in top-level `botUsernames`                        |
| Unknown         | `authorType: Unknown`, and not a detected bot                                                                       |
| Viewer-authored | `viewerDidAuthor: true`, `authorType: User`, login does not contain `[bot]`, login is not in `botUsernames`         |
| Other human     | `authorType: User`, login does not contain `[bot]`, login is not in `botUsernames`, and `viewerDidAuthor` is absent |

A Shepherd reply is a latest comment whose body begins `<!-- pr-shepherd -->`. "Marker-ended" below means that prefix is present and GitHub still reports `isResolved: false`.

## Where the requirement is read

`requiresConversationResolution` is folded in `parseBranchRules` (`src/github/batch-parsers-rules.mts`):

| Source                                                            | Sets the folded flag |
| ----------------------------------------------------------------- | -------------------- |
| Classic `branchProtectionRule.requiresConversationResolution`     | yes                  |
| Ruleset `PULL_REQUEST` parameter `requiredReviewThreadResolution` | yes                  |
| Ruleset type `REQUIRED_REVIEW_THREAD_RESOLUTION`                  | yes                  |
| Missing `baseRef`                                                 | flag stays false     |

`branchProtection` on the iterate result is the classic rule only (`src/github/branch-protection.mts`). A ruleset-only requirement is visible on `mergeRequirements.conversationsResolved.required` and can be absent from `branchProtection.requiresConversationResolution`.

| Consumer                                                             | Uses the folded flag |
| -------------------------------------------------------------------- | -------------------- |
| `Conversations Resolved:` line (`deriveMergeRequirements`)           | yes                  |
| `WAIT` / ready-delay `CANCEL` note (`blockedReasonFromRequirements`) | yes                  |
| Fallback `**required**` header when `mergeRequirements` is absent    | classic object only  |
| `classifyThreadVisibility`                                           | no                   |
| `buildThreadMutationRouting`                                         | no                   |
| `computeStatus`                                                      | no                   |
| `ESCALATE` trigger list                                              | no                   |

`computeStatus` counts threads still in `actionable` plus `resolutionOnly`. `unresolvedCount` on the requirements line counts every fetched thread with `isResolved: false`. After an other-human thread leaves the work set, ShepherdStatus can be `READY` while `Conversations Resolved: No [Required]` is still true.

## Current mutation matrix

Applies to threads already selected into the work set. `iterate.resolveOtherHumanThreads` defaults to `none`. Classification rules with `autoResolve: true` add a standalone resolve for that thread id even at `none`; an unmarked thread is still replied to.

| Class                                       | Unmarked          | Marker-ended |
| ------------------------------------------- | ----------------- | ------------ |
| Detected bot                                | reply and resolve | resolve only |
| Unknown                                     | reply and resolve | resolve only |
| Viewer-authored human                       | reply and resolve | resolve only |
| Other human, `none`                         | reply             | no mutation  |
| Other human, `outdated`, thread is outdated | reply and resolve | resolve only |
| Other human, `outdated`, thread is current  | reply             | no mutation  |
| Other human, `always`                       | reply and resolve | resolve only |

Reply and paired resolve share the `apply review` command. A marker-ended resolve is the separate resolve-only command. Both use the thread id when GitHub has cleared the path or line.

`viewerCanReply: true` is required for a reply id. `viewerCanResolve: true` is required for a resolve id. A missing capability drops that id. The thread is surfaced once, then marker-gated until the body changes. `authorization-required` is the automatic mark-ready handoff; this skip stays a one-look omission.

## Current visibility matrix

"Every tick" means the thread stays in `FIX_CODE` until GitHub reports `isResolved: true`, provided the mutation it needs is authorized. "Until seen" means the seen-marker gate: first look, again when the transcript changes, then omitted while the transcript is unchanged.

| Class                   | Active, unmarked | Active, marker-ended                 | Outdated or minimized, unmarked | Outdated or minimized, marker-ended  |
| ----------------------- | ---------------- | ------------------------------------ | ------------------------------- | ------------------------------------ |
| Detected bot            | every tick       | resolution-only, every tick          | every tick                      | every tick                           |
| Unknown                 | until seen       | resolution-only, every tick          | every tick                      | every tick                           |
| Viewer-authored human   | every tick       | resolution-only, every tick          | every tick                      | every tick                           |
| Other human, `none`     | until seen       | left unresolved; no further mutation | every tick (reply)              | left unresolved; no further mutation |
| Other human, `outdated` | until seen       | left unresolved; no further mutation | every tick                      | every tick (resolve)                 |
| Other human, `always`   | every tick       | resolution-only, every tick          | every tick                      | every tick                           |

Resolved threads are out of both mutation sets. A resolved thread whose latest comment is not a Shepherd reply is first-look once. Human authors are never minimized.

`iterate.resolveOtherHumanThreads: always` is the only current setting that replies and resolves every other-human inline thread. It does so on every branch, including branches whose folded flag is false.

## Requirement versus outcome

This is an unresolved other-human thread after the Shepherd reply lands. The enum is `iterate.resolveOtherHumanThreads`. "Dropped" means the thread is in neither `actionable` nor `resolutionOnly`. A later push that marks a current thread outdated uses the outdated row on the next tick.

| Requires resolution | Enum       | Thread              | After the Shepherd reply                   | When no other work remains                                                                            |
| ------------------- | ---------- | ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| no                  | `none`     | current or outdated | dropped; GitHub thread stays open          | can be `READY`; `CANCEL` says `has been ready for review` when merge is not `BLOCKED`                 |
| no                  | `outdated` | current             | dropped; GitHub thread stays open          | same as `none`                                                                                        |
| no                  | `outdated` | outdated            | stays until `resolveReviewThread` succeeds | `READY` after that resolve                                                                            |
| no                  | `always`   | current or outdated | stays until resolve succeeds               | `READY` after that resolve                                                                            |
| yes                 | `none`     | current or outdated | dropped; GitHub thread stays open          | can be `READY` while merge stays `BLOCKED`; `CANCEL` includes `unresolved conversations are required` |
| yes                 | `outdated` | current             | dropped; GitHub thread stays open          | same as the required `none` row while the thread stays open                                           |
| yes                 | `outdated` | outdated            | stays until resolve succeeds               | `READY` once that thread is resolved and no other fetched thread is open                              |
| yes                 | `always`   | current or outdated | stays until resolve succeeds               | `READY` once every fetched thread is resolved                                                         |

`unresolvedCount` is fetched threads with `isResolved: false`, including threads the enum leaves open. A successful batch pages with `reviewThreads(last:)` until `hasPreviousPage` is false. ShepherdStatus uses the visible work set.

## Requested policy matrix

"Match" is whether that row's current behavior already does the requested cell. The default enum is `none`. `always` is a separate row because it resolves other humans on every branch.

| Condition                                       | Requested behavior                            | Current behavior                                                                                | Match |
| ----------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----- |
| Resolution required, viewer-authored human      | reply; resolve once the Shepherd reply exists | reply and resolve, including marker-ended retry                                                 | yes   |
| Resolution required, other human, any freshness | reply; resolve once the Shepherd reply exists | reply; resolve only when the enum is `outdated` (outdated threads) or `always` (every thread)   | no    |
| Resolution required, detected bot or Unknown    | unchanged                                     | reply and resolve; Unknown active threads are until-seen unless marker-ended                    | yes   |
| Resolution not required, any human              | keep the enum                                 | enum, default reply-only for other humans                                                       | yes   |
| Resolution not required, `always`               | keep that configured behavior                 | reply and resolve other humans on branches that do not require resolution                       | yes   |
| A decision remains                              | `ESCALATE`                                    | decision stays inside `FIX_CODE`, or the loop ends in `CANCEL` / `fix-thrash` / `stall-timeout` | no    |

The required-resolution row for other humans is the gap. `always` replies and resolves those threads on every branch. The requested switch is the folded flag.

## Decisions and escalation

[escalations.md](escalations.md) is a closed trigger list. None of the triggers is "this human inline thread needs a decision" or "conversation resolution is required."

| Situation                                                                                                 | Current action                                                                                                       | Trigger         |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------- |
| Choose a code edit versus an acknowledgment reply                                                         | `FIX_CODE`. Instructions say to decide, then run the generated review mutation even when no code change is warranted | none            |
| `viewerCanReply` or `viewerCanResolve` is not true                                                        | surface once, omit the mutation, suppress until the transcript changes                                               | none            |
| Resolution required, other-human thread already replied to, enum leaves it open                           | thread leaves the work set; ready-delay `CANCEL` names `unresolved conversations are required`                       | none            |
| Located thread stays in the work set for `iterate.fixAttemptsPerThread` caller-visible `FIX_CODE` results | following unchanged tick                                                                                             | `fix-thrash`    |
| `WAIT` or `FIX_CODE` fingerprint unchanged through an enabled stall timeout                               | handoff                                                                                                              | `stall-timeout` |
| Folded flag is false because `baseRef` was missing                                                        | enum applies; requirements show conversation resolution not required                                                 | none            |

`ambiguousComments` on an escalation payload is the actionable top-level PR comment list copied onto some handoffs. Inline threads are copied separately as `unresolvedThreads`. The field name is not an escalation trigger.

The requested "if a decision needs to be made, escalate" cell has no predicate in the code. The two choices that show up in this feature are: whether an inline comment warrants a code change, and what to do when GitHub will not let the viewer resolve a thread the branch requires to be resolved. Both stay off the escalation list.

## Surfaces outside this policy

Conversation resolution is a review-thread rule. These surfaces keep their own routing on every branch.

| Surface                    | Reply              | Resolve / hide                                                                                  |
| -------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| Inline review thread       | generated reply    | resolve per the mutation matrix                                                                 |
| Top-level PR comment       | no generated reply | minimize non-humans per `iterate.minimizeComments`; humans are marker-gated and never minimized |
| `COMMENTED` review summary | no generated reply | minimize eligible non-humans after known inline child threads are resolved                      |
| `APPROVED` review          | no generated reply | minimize only when `iterate.minimizeApprovals` is on and the author is eligible                 |
| Human `CHANGES_REQUESTED`  | no generated reply | left in place; the review stays on the status count after its body is unchanged                 |
| Bot `CHANGES_REQUESTED`    | no generated reply | dismiss when `viewerCanAdminister` is true                                                      |

## Code map

| Behavior                                 | Location                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Other-human resolve enum                 | `src/comments/thread-resolve-policy.mts`                                        |
| Reply / resolve id selection             | `src/commands/iterate/thread-mutation-routing.mts`                              |
| Work-set membership                      | `src/comments/thread-visibility.mts`                                            |
| Folded branch rule                       | `src/github/batch-parsers-rules.mts`                                            |
| Printed requirement and cancel phrase    | `src/merge-status/requirements.mts`, `src/merge-status/requirements-format.mts` |
| ShepherdStatus from the visible work set | `src/commands/check-status.mts`, called from `src/commands/check.mts`           |
| Escalation triggers                      | `docs/escalations.md`, `src/commands/iterate/escalate.mts`                      |
