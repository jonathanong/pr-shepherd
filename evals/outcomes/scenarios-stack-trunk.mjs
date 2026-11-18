// A stack merge whose top layer conflicts with trunk, though GitHub calls every layer mergeable.

import { PR_URL } from "../lib.mjs";
import { renumber } from "./stack-ticks.mjs";
import { STEPS } from "./world.mjs";

export const STACK_TRUNK_SCENARIOS = [
  {
    // GitHub's `mergeable` compares an upper layer only with its parent layer.
    slug: "62-stack-merge-trunk-conflict",
    fixture: "212-aggregate-stack-merge-trunk-ahead",
    transform: renumber([
      [351, 40],
      [352, 41],
      [353, 42],
      [36, 7],
    ]),
    tags: ["stack", "merge", "conflicts"],
    prompt: `Merge the stack that ${PR_URL} belongs to.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed), every PR authored by
\`you\`. Each layer is open, not a draft, approved, with checks passed, and
GitHub reports it MERGEABLE with mergeStateStatus CLEAN against its own base:
- Layer 1, PR #40 "Layer 1": base \`main\`, head \`layer-40\` at \`e111111\`.
- Layer 2, PR #41 "Layer 2": base \`layer-40\`, head \`layer-41\` at \`e222222\`.
- Layer 3, PR #42 "Layer 3": base \`layer-41\`, head \`layer-42\` at \`e333333\`.
An unrelated PR (#50, by \`teammate\`) merged into \`main\` ten minutes ago, after
all three layers were last pushed. \`main\` now has one commit that the heads of
layers 1-3 lack. Its change to \`evals/CASES.csv\` and \`evals/README.md\` overlaps
the lines layer 3 edits in the same files; layers 1 and 2 do not touch them.
GitHub computes an upper layer's mergeability against its parent layer's branch
only. \`gh stack merge 42 --yes --squash\` squash-merges layers 1 through 42 into
\`main\` atomically. If any layer conflicts with \`main\`, it prints
\`merge failed: Merge conflict detected\` and merges nothing.
\`gh pr merge\` on a layer whose base is still the layer below's branch lands it
on that branch, not on \`main\`. A comparison or trial merge of any layer's head
against \`main\` answers as the facts above imply. No reviews pending, no threads
or comments.`,
    grader: `The agent does not run, or commit to running, the merge before checking the top
layer (#42) against the current \`main\`. It either checks first (for example
\`git fetch\` and \`git merge-tree --write-tree FETCH_HEAD <head of #42>\`, or
any equivalent test of #42's head against \`main\`) or plans that check as the
step before the merge. Because the check shows a conflict, it then plans to
rebase the whole stack onto \`main\` from its bottom layer (\`gh stack rebase\`,
resolving the conflict in layer 3) and push the rewritten stack (\`gh stack
push\`, or \`--force-with-lease\` for each rewritten layer), then merge again.

${STEPS}

Failing responses do any of: run or commit to \`gh stack merge\` (or any merge)
as the first action without checking against \`main\`; merge or enqueue layers
one at a time with \`gh pr merge\`; retry the merge after it reports a conflict;
rebase or push only layer 3 and leave layers 1 and 2 on the old base; merge
\`main\` into a layer branch; use bare \`--force\`; close or recreate PRs; hand
off to a human.`,
  },
];
