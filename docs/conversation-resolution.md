# Conversation resolution and human inline threads

[← README](../README.md) | [comments.md](comments.md) | [escalations.md](escalations.md)

How Shepherd replies to and resolves inline review threads by author class, how that interacts with GitHub's "require conversation resolution" branch rule, and where the current behavior differs from a requested policy. For contributors working on thread routing and for anyone debugging a PR that is `READY` while GitHub still says conversations block the merge.

Shepherd replies to human inline threads. It resolves them only for the authenticated viewer's own threads, and for other humans when [`iterate.resolve-other-human-threads`](configuration.md#iterateresolve-other-human-threads--default-none) allows it. That enum does not read the branch rule.

**Requested policy, not implemented:**

- When the base branch requires conversation resolution, reply to every human inline thread and resolve it once a Shepherd reply is in place (the viewer-authored pairing: reply and resolve in one `apply review`, then a resolve-only retry while the marker is present and the thread is open).
- When it does not, keep the enum.
- When the next step is a decision Shepherd cannot make, `ESCALATE`.

The matrices below show current behavior, then the requested policy against the same rows.

## What "human inline" means

A row is one GitHub review thread (`pullRequest.reviewThreads`), the unit conversation resolution blocks on. The class comes from the original inline comment; later replies do not change it.

| Class           | Predicate                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Detected bot    | `authorType: Bot`, a login containing `[bot]`, or a login listed in top-level `bot-usernames`                        |
| Unknown         | `authorType: Unknown`, and not a detected bot                                                                        |
| Viewer-authored | `viewerDidAuthor: true`, `authorType: User`, login does not contain `[bot]`, login is not in `bot-usernames`         |
| Other human     | `authorType: User`, login does not contain `[bot]`, login is not in `bot-usernames`, and `viewerDidAuthor` is absent |

A Shepherd reply is a latest comment whose body begins `<!-- pr-shepherd -->`. "Marker-ended" means that prefix is present and GitHub still reports `isResolved: false`.

## Where the requirement is read

`parseBranchRules` (`src/github/batch-parsers-rules.mts`) folds `requiresConversationResolution` from:

| Source                                                            | Sets the folded flag |
| ----------------------------------------------------------------- | -------------------- |
| Classic `branchProtectionRule.requiresConversationResolution`     | yes                  |
| Ruleset `PULL_REQUEST` parameter `requiredReviewThreadResolution` | yes                  |
| Ruleset type `REQUIRED_REVIEW_THREAD_RESOLUTION`                  | yes                  |
| Missing `baseRef`                                                 | flag stays false     |

`branchProtection` on the iterate result is the classic rule only (`src/github/branch-protection.mts`). A ruleset-only requirement shows on `mergeRequirements.conversationsResolved.required` and can be absent from `branchProtection.requiresConversationResolution`.

| Consumer                                                                                                                                   | Uses the folded flag |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| `Conversations Resolved:` line (`deriveMergeRequirements`)                                                                                 | yes                  |
| `WAIT` / ready-delay `CANCEL` note (`blockedReasonFromRequirements`)                                                                       | yes                  |
| Compact READY certification with a truncated review sample (`poll-summary-readiness.mts`, see [graphql.md](graphql.md#poll-summary-reads)) | yes                  |
| Fallback `**required**` header when `mergeRequirements` is absent                                                                          | classic object only  |
| `classifyThreadVisibility`                                                                                                                 | no                   |
| `buildThreadMutationRouting`                                                                                                               | no                   |
| `computeStatus`                                                                                                                            | no                   |
| `ESCALATE` trigger list                                                                                                                    | no                   |

`computeStatus` counts threads still in `actionable` plus `resolutionOnly`. `unresolvedCount` on the requirements line counts every fetched thread with `isResolved: false`. So once an other-human thread leaves the work set, ShepherdStatus can be `READY` while `Conversations Resolved: No [Required]` is still printed.

## Current mutation matrix

For threads already in the work set. `iterate.resolve-other-human-threads` defaults to `none`.

| Class                                       | Unmarked          | Marker-ended |
| ------------------------------------------- | ----------------- | ------------ |
| Detected bot                                | reply and resolve | resolve only |
| Unknown                                     | reply and resolve | resolve only |
| Viewer-authored human                       | reply and resolve | resolve only |
| Other human, `none`                         | reply             | no mutation  |
| Other human, `outdated`, thread is outdated | reply and resolve | resolve only |
| Other human, `outdated`, thread is current  | reply             | no mutation  |
| Other human, `always`                       | reply and resolve | resolve only |

- Reply and paired resolve share one `apply review` command; a marker-ended resolve is the separate resolve-only command. Both use the thread ID, so they work after GitHub clears the path or line.
- A classification rule with `autoResolve: true` adds a standalone resolve for that thread even at `none`; an unmarked thread is still replied to.
- On GraphQL, `viewerCanReply: false` or `viewerCanResolve: false` omits the generated mutation. REST has no capability fields, so an otherwise-eligible operation is attempted and GitHub decides. A definite, non-throttled REST 403 or 404 is surfaced once, then marker-gated until the body changes; review denials do not use `authorization-required` or count toward `fix-thrash`. Quota failures and uncertain outcomes stay eligible for reconciliation.

## Current visibility matrix

"Every tick": the thread stays in `FIX_CODE` until GitHub reports `isResolved: true`, provided its mutation is authorized. "Until seen": the seen-marker gate (first look, again when the transcript changes, then omitted while unchanged).

| Class                   | Active, unmarked | Active, marker-ended                 | Outdated or minimized, unmarked | Outdated or minimized, marker-ended  |
| ----------------------- | ---------------- | ------------------------------------ | ------------------------------- | ------------------------------------ |
| Detected bot            | every tick       | resolution-only, every tick          | every tick                      | every tick                           |
| Unknown                 | until seen       | resolution-only, every tick          | every tick                      | every tick                           |
| Viewer-authored human   | every tick       | resolution-only, every tick          | every tick                      | every tick                           |
| Other human, `none`     | until seen       | left unresolved; no further mutation | every tick (reply)              | left unresolved; no further mutation |
| Other human, `outdated` | until seen       | left unresolved; no further mutation | every tick                      | every tick (resolve)                 |
| Other human, `always`   | every tick       | resolution-only, every tick          | every tick                      | every tick                           |

Resolved threads are out of both mutation sets; one whose latest comment is not a Shepherd reply is first-look once. Human authors are never minimized. `always` is the only current setting that replies to and resolves every other-human thread, on every branch, including branches whose folded flag is false.

## Requirement versus outcome

An unresolved other-human thread after the Shepherd reply lands. "Dropped" means the thread is in neither `actionable` nor `resolutionOnly`. A later push that makes a current thread outdated uses the outdated row on the next tick.

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

`unresolvedCount` includes threads the enum leaves open. A successful batch pages `reviewThreads(last:)` until `hasPreviousPage` is false.

## Requested policy matrix

"Match" says whether current behavior already does the requested cell.

| Condition                                       | Requested behavior                            | Current behavior                                                                                | Match |
| ----------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----- |
| Resolution required, viewer-authored human      | reply; resolve once the Shepherd reply exists | reply and resolve, including marker-ended retry                                                 | yes   |
| Resolution required, other human, any freshness | reply; resolve once the Shepherd reply exists | reply; resolve only when the enum is `outdated` (outdated threads) or `always` (every thread)   | no    |
| Resolution required, detected bot or Unknown    | unchanged                                     | reply and resolve; Unknown active threads are until-seen unless marker-ended                    | yes   |
| Resolution not required, any human              | keep the enum                                 | enum, default reply-only for other humans                                                       | yes   |
| Resolution not required, `always`               | keep that configured behavior                 | reply and resolve other humans on branches that do not require resolution                       | yes   |
| A decision remains                              | `ESCALATE`                                    | decision stays inside `FIX_CODE`, or the loop ends in `CANCEL` / `fix-thrash` / `stall-timeout` | no    |

The gap is the required-resolution, other-human row; the requested switch is the folded flag.

## Decisions and escalation

[escalations.md](escalations.md) is a closed trigger list; none of its triggers is "this human inline thread needs a decision" or "conversation resolution is required."

| Situation                                                                                                       | Current action                                                                                                       | Trigger         |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------- |
| Choose a code edit versus an acknowledgment reply                                                               | `FIX_CODE`. Instructions say to decide, then run the generated review mutation even when no code change is warranted | none            |
| GraphQL reports `viewerCanReply` or `viewerCanResolve` false; or GitHub denies the REST attempt                 | surface once, omit/retry no generated mutation, suppress until the transcript changes                                | none            |
| Resolution required, other-human thread already replied to, enum leaves it open                                 | thread leaves the work set; ready-delay `CANCEL` names `unresolved conversations are required`                       | none            |
| Located thread stays in the work set for `iterate.triage-attempts-per-thread` caller-visible `FIX_CODE` results | following unchanged tick                                                                                             | `fix-thrash`    |
| `WAIT` or `FIX_CODE` fingerprint unchanged through an enabled stall timeout                                     | handoff                                                                                                              | `stall-timeout` |
| Folded flag is false because `baseRef` was missing                                                              | enum applies; requirements show conversation resolution not required                                                 | none            |

`ambiguousComments` on an escalation payload is the actionable top-level PR comment list copied onto some handoffs; inline threads are copied separately as `unresolvedThreads`. The field name is not a trigger.

The requested "escalate when a decision is needed" has no predicate in code. The two decisions this feature raises (whether an inline comment warrants a code change, and what to do when GitHub will not let the viewer resolve a thread the branch requires resolved) both stay off the escalation list.

## Surfaces outside this policy

Conversation resolution is a review-thread rule. Other surfaces keep their own routing on every branch.

| Surface                    | Reply              | Resolve / hide                                                                                       |
| -------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| Inline review thread       | generated reply    | resolve per the mutation matrix                                                                      |
| Top-level PR comment       | no generated reply | minimize non-humans per `iterate.minimize-comments`; humans are marker-gated and never minimized     |
| `COMMENTED` review summary | no generated reply | minimize eligible non-humans after known inline child threads are resolved                           |
| `APPROVED` review          | no generated reply | minimize only when `iterate.minimize-approvals` is on and the author is eligible                     |
| Human `CHANGES_REQUESTED`  | no generated reply | left in place; the review stays on the status count after its body is unchanged                      |
| Bot `CHANGES_REQUESTED`    | no generated reply | dismiss when GraphQL reports `viewerCanAdminister: true`; REST attempts and trusts GitHub's response |

## Code map

| Behavior                                 | Location                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Other-human resolve enum                 | `src/comments/thread-resolve-policy.mts`                                        |
| Reply / resolve id selection             | `src/commands/iterate/thread-mutation-routing.mts`                              |
| Work-set membership                      | `src/comments/thread-visibility.mts`                                            |
| Folded branch rule                       | `src/github/batch-parsers-rules.mts`                                            |
| Printed requirement and cancel phrase    | `src/merge-status/requirements.mts`, `src/merge-status/requirements-format.mts` |
| ShepherdStatus from the visible work set | `src/commands/check-status.mts`, called from `src/commands/check.mts`           |
| Escalation triggers                      | [escalations.md](escalations.md), `src/commands/iterate/escalate.mts`           |
