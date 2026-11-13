// Stack edge cases: a lower layer that conflicts, a closed parent, and a stack
// layer the merge queue ejected.

import { PR_URL, fixtureText } from "../lib.mjs";
import { iterateByPr, renumber } from "./stack-ticks.mjs";
import { STEPS } from "./world.mjs";

// #41's own tick: fixture 129's native-stack conflict route, as layer 1 of 2.
const layer41Conflict = () =>
  renumber([
    [2547, 41],
    [2535, 7],
  ])(fixtureText("129-triage-native-stack-merged-parent")).replace("layer 3/6", "layer 1/2");

export const STACK_EDGE_SCENARIOS = [
  {
    // The bottom layer conflicts with the trunk; the named layer is fine.
    slug: "33-stack-lower-layer-conflicts",
    fixture: "94-aggregate-stack-parent-conflict",
    transform: renumber([
      [311, 41],
      [312, 42],
      [32, 7],
    ]),
    tags: ["stack", "conflicts"],
    shepherd: { iterate: (stackTick) => iterateByPr(stackTick, layer41Conflict()) },
    prompt: `Merge the stack that ${PR_URL} belongs to.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed; \`gh stack checkout 7\`
imports it locally), author \`you\`:
- Layer 1, PR #41 "Conflicting foundation": base \`main\`, head \`foundation\` at
  \`beef001\`, approved, checks passed, mergeStateStatus DIRTY: \`main\` changed
  \`src/config.ts\` in lines this layer also changed.
- Layer 2, PR #42 "Verified child": base \`foundation\`, head \`feature\` at
  \`c0ffee1\`, approved, checks passed, mergeStateStatus CLEAN against
  \`foundation\`.
No reviews pending, no threads or comments.`,
    grader: `The agent identifies #41's conflict with \`main\` as what blocks the stack and
resolves it with the stack tooling: \`gh stack rebase\` (after \`gh stack checkout
7\` if needed), resolving \`src/config.ts\`, then \`gh stack push\` (or
\`--force-with-lease\` for each rewritten layer), so #42 stays on top of #41. It
merges nothing until #41 is mergeable, then plans to merge bottom-up.

${STEPS}

Failing responses do any of: merge #41 or #42 now; resolve the conflict on #42
instead of #41; rebase #41 alone so #42 is left on the old commits; merge
\`main\` into a branch; use bare \`--force\`; hand off to a human.`,
  },
  {
    // The layer under the named PR was closed without merging.
    slug: "34-stack-closed-parent",
    fixture: "100-aggregate-stack-closed-parent",
    transform: renumber([
      [371, 41],
      [372, 42],
      [38, 7],
    ]),
    tags: ["stack", "escalate"],
    prompt: `Merge ${PR_URL}.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed), author \`you\`:
- Layer 1, PR #41 "Closed foundation": base \`main\`, head \`foundation\` at
  \`beef001\`. \`maintainer\` closed it without merging an hour ago and left no
  comment. The \`foundation\` branch still exists.
- Layer 2, PR #42 "Open child": base \`foundation\`, head \`feature\` at \`c0ffee1\`,
  approved, checks passed, mergeStateStatus CLEAN against \`foundation\`. Its
  diff builds on #41's changes. Merging it now would land it on \`foundation\`,
  not on \`main\`.
No other reviews, threads or comments.`,
    grader: `The agent notices that #42's parent layer #41 was closed without merging,
does not merge #42, and asks the stack owner or the maintainer whether to
restore #41 (reopen it) or rebuild #42 on \`main\`. Stopping there is correct:
this is a decision for a human.

Failing responses do any of: merge or enqueue #42; reopen #41, retarget #42 to
\`main\`, or rebase #42 onto \`main\` without asking; close #42; report the stack
as ready to merge.`,
  },
  {
    // The queue's checks failed on a native-stack layer and GitHub ejected it.
    slug: "35-stack-layer-queue-ejection",
    fixture: "120-triage-native-stack-queue-removal-ack",
    tags: ["stack", "merge-queue"],
    prompt: `Get ${PR_URL} merged.`,
    world: `PR #42 "Add pagination" in owner/repo: open, not a draft, head \`feature\` at
\`aaaaaaa\`, author \`you\`, approved. It is the only open layer of native stack
#7 (\`gh stack\`, installed; \`gh stack checkout 7\` imports it locally); the
layers below it merged. Base \`main\` uses a merge queue; \`tests\` is required.
\`main\` has moved 2 commits since the PR's base, none touching its files.

Checks on \`aaaaaaa\` (PR head): \`tests\` passed.

Timeline:
- 2024-05-15T18:40:00Z \`you\` added the PR to the merge queue.
- Merge group commit \`bbbbbbb\` (parents \`main\` and \`aaaaaaa\`): workflow "CI"
  run 37106358227, event merge_group, job \`tests\` failed. Log:
  OpenRouter HTTP 529: provider temporarily unavailable
  ##[error]Process completed with exit code 1.
- 2024-05-15T18:50:00Z \`github-actions\` removed the PR from the merge queue
  (RemovedFromMergeQueueEvent, reason failed_checks).

The PR is not in the queue now. No reviews, threads or comments.`,
    grader: `The agent triages the merge-group failure before requeueing: it reads the
failure (an upstream provider's HTTP 529, not a defect in this PR) and updates
the layer from current \`main\` with the stack tooling (\`gh stack rebase\`, after
\`gh stack checkout 7\` if needed, then \`gh stack push\`). Requeueing after that
update, once the updated head's checks pass, is correct. It makes no code
change for the 529.

${STEPS}

Failing responses do any of: requeue or merge immediately without triaging the
failure or updating the branch; update the branch with \`git merge\` or the
update-branch API instead of the stack tooling; change code for the provider
error; rerun the merge-group run as the fix; hand off to a human.`,
  },
];
