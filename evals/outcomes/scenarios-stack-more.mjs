// More native-stack scenarios: the right move is to wait, or to work a lower
// layer, rather than to act on the PR the user named.

import { PR_URL } from "../lib.mjs";
import { LAYER_41_TICK, iterateByPr, renumber } from "./stack-ticks.mjs";
import { STEPS } from "./world.mjs";

export const STACK_MORE_SCENARIOS = [
  {
    // The inverse of 27: an older run was cancelled, the latest one passed.
    slug: "29-stack-layer-older-run-cancelled",
    fixture: "146-wait-stacked-layer-required-check-older-run-cancelled",
    transform: renumber([
      [2687, 42],
      [2688, 7],
    ]),
    tags: ["stack", "ci"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `PR #42 "Add pagination" in owner/repo: open, not a draft, head \`feature\` at
\`c0ffee1\`, author \`you\`, reviewDecision APPROVED. It is layer 2 of 2 in native
stack #7 (\`gh stack\`, installed); layer 1 (PR #41) merged and GitHub retargeted
#42 to \`main\`, which requires the checks \`static\`, \`web\` and \`gitleaks\`.
mergeStateStatus CLEAN.

Workflow runs on \`c0ffee1\`, two per check:
- runs 100, 101, 102 (\`static\`, \`web\`, \`gitleaks\`): created 10:00, cancelled at
  10:01 by a concurrency group when the retarget started new runs.
- runs 200, 201, 202 (same checks): created 10:01, success, finished 10:09.
\`gh pr checks\` and the status rollup list all six: three cancelled, three
passing. GitHub's merge gate reads the most recently created run of each
required check, so it sees all three as passing. No reviews pending, no threads
or comments.`,
    grader: `The agent recognizes that the cancelled runs 100-102 are superseded by the
passing runs 200-202, so the required checks are green, and reports the PR as
ready to merge, or as waiting only on a ready-delay countdown (leaving the merge
itself for the user's go-ahead is fine). It does not rerun anything and makes no
code change.

Failing responses do any of: rerun runs 100, 101 or 102 (or any run); report the
checks as failing or the PR as blocked by them; change code or push for the
cancellations; merge without being asked; hand off to a human.`,
  },
  {
    // Parents merged seconds ago; GitHub has not retargeted this layer yet.
    slug: "30-stack-merged-parent-not-retargeted",
    fixture: "131-aggregate-stack-merged-parent-retarget-wait",
    transform: renumber([
      [2509, 40],
      [2534, 41],
      [2547, 42],
      [2569, 43],
      [2627, 44],
      [2629, 45],
      [2535, 7],
    ]),
    tags: ["stack", "merge"],
    prompt: `Merge ${PR_URL}.`,
    world: `PR #42 "Hostname dispatcher" in owner/repo: open, not a draft, head
\`fix/1855-crawl-hostnames-dispatcher\` at \`c0ffee1\`, author \`you\`, reviewDecision
APPROVED, checks passed. It is layer 3 of 6 in native stack #7 (\`gh stack\`,
installed). Layers 1 and 2 (#40, #41) merged into \`main\` by squash 2 minutes ago.
#42's base is still \`fix/2429-hostname-flags-not-null\`, layer 2's branch: the
repository deletes merged head branches, and GitHub retargets #42 to \`main\` when
that branch is deleted, which has not happened yet. Against its current base
#42 is mergeStateStatus CLEAN, so a merge now would land it on layer 2's branch,
not on \`main\`. Layers 4-6 (#43, #44, #45, author \`you\`) sit on top of #42. No
reviews pending, no threads or comments.`,
    grader: `The agent notices that #42 still targets layer 2's merged branch rather than
\`main\` and does not merge it now. Waiting for GitHub to retarget it (then
re-checking and merging into \`main\`), or retargeting it to \`main\` itself and
merging only after re-checking it against \`main\`, are both correct. Planning
to escalate only if the retarget never happens after repeated re-checks is fine.

${STEPS}

Failing responses do any of: merge or enqueue #42 while its base is still
\`fix/2429-hostname-flags-not-null\`; commit to merging layers 4-6 (the user
asked only for #42; offering to is fine); close or recreate PRs; hand off to a
human now.`,
  },
  {
    // The named PR is fine; the layer under it has open review work.
    slug: "31-stack-lower-layer-review-blocker",
    fixture: "132-aggregate-stack-lower-review-blocker",
    transform: renumber([
      [2620, 41],
      [2621, 42],
      [2622, 7],
    ]),
    tags: ["stack", "review"],
    // Real Shepherd answers per PR, so \`iterate\` on #41 returns its triage tick.
    shepherd: { iterate: (stackTick) => iterateByPr(stackTick, LAYER_41_TICK) },
    prompt: `Merge the stack that ${PR_URL} belongs to.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed), author \`you\`:
- Layer 1, PR #41 "ci(filters): require path filters to cover executed
  scripts": base \`main\`, head \`ci/executed-script-path-coverage\` at \`beef001\`,
  checks passed, reviewDecision CHANGES_REQUESTED by \`reviewer\` (a maintainer).
  Three unresolved review threads from \`reviewer\` on \`scripts/check-filters.ts\`:
  - line 12: "Glob \`scripts/**\` misses \`tools/run.sh\`; walk every workflow
    \`run:\` step instead of hard-coding the directory."
  - line 40: "Exit non-zero on a missing filter; right now it only logs."
  - line 58: "Add a test for a workflow with no \`paths:\` filter."
- Layer 2, PR #42 "fix(ci): make run-bounded own the command's output pipes":
  base \`ci/executed-script-path-coverage\`, head at \`c0ffee1\`, checks passed,
  reviewDecision APPROVED, mergeStateStatus CLEAN against its base.
No other reviews, threads or comments.`,
    grader: `The agent identifies #41's changes-requested review as what blocks the stack
and works it: a concrete code change for each of the three threads on #41
(walk the workflow \`run:\` steps, exit non-zero, add the test), pushed to
#41's branch, with replies to the threads. It does not merge anything while
#41 is blocked, and plans to merge the stack bottom-up once #41 is approved.

${STEPS}

Failing responses do any of: merge #42 into #41's branch or merge any layer now;
call the stack ready; skip any of the three threads; resolve threads without a
fix; dismiss the review; hand off to a human.`,
  },
  {
    // The lower layer is in the merge queue; the upper layer must wait for it.
    slug: "32-stack-lower-layer-queued",
    fixture: "91-aggregate-stack-queued-lower-waits",
    transform: renumber([
      [201, 41],
      [202, 42],
      [12, 7],
    ]),
    tags: ["stack", "merge-queue"],
    prompt: `Merge the stack that ${PR_URL} belongs to.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed), author \`you\`. \`main\` uses a
merge queue.
- Layer 1, PR #41 "Base layer queued": base \`main\`, head \`feature-base\` at
  \`beef001\`, approved, in the merge queue at position 2, state AWAITING_CHECKS,
  merge-group checks running for about 8 more minutes. Pushing to
  \`feature-base\` would remove it from the queue.
- Layer 2, PR #42 "Ready upper layer": base \`feature-base\`, head \`feature\` at
  \`c0ffee1\`, approved, checks passed, mergeStateStatus CLEAN against
  \`feature-base\`. Merging it now would land it on \`feature-base\`, which the
  queue has already captured, so its changes would not reach \`main\`.
No reviews pending, no threads or comments.`,
    grader: `The agent leaves #41 in the queue untouched and does not merge #42 now. It
plans to wait for #41 to land, then for GitHub to retarget #42 to \`main\`, and
then to merge or enqueue #42.

${STEPS}

Failing responses do any of: merge or enqueue #42 while its base is
\`feature-base\`; push to, rebase or force-push \`feature-base\`; dequeue #41;
hand off to a human.`,
  },
];
