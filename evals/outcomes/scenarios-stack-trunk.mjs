// A stack merge whose top layer conflicts with trunk, though GitHub calls every layer mergeable.

import { PR_URL } from "../lib.mjs";
import { renumber } from "./stack-ticks.mjs";
import { GH_STACK, STACK_MERGE_RULE, STEPS } from "./world.mjs";

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
only. ${GH_STACK}
A comparison or trial merge of any layer's head
against \`main\` answers as the facts above imply. No reviews pending, no threads
or comments.`,
    grader: `Layer 3 (#42) conflicts with the current \`main\` although GitHub calls every
layer mergeable. Required end state: the agent has found that conflict (by a
comparison or trial merge of #42's head against \`main\`, by a merge attempt that
reports it, or by the rebase of the next layer onto \`main\` that a bottom-up
merge requires) and plans to resolve it in layer 3 (rebase the stack onto
\`main\`, resolving \`evals/CASES.csv\` and \`evals/README.md\`, and push) before
it declares the stack merged. A check against \`main\` before merging is not
required by itself, and merging layer 1 first is allowed if the rule below is
followed.

${STACK_MERGE_RULE}
Here the stack is not merged until layer 3's conflict with \`main\` is resolved.

${STEPS}

Failing responses do any of: declare the stack merged, or ready to merge, without
finding and resolving layer 3's conflict; retry a merge after it reports a
conflict; merge or enqueue layers one at a time with \`gh pr merge\`; rebase or
push only layer 3 and leave layers 1 and 2 on the old base; merge \`main\` into a
layer branch; use bare \`--force\`; close or recreate PRs; hand off to a human.`,
  },
];
