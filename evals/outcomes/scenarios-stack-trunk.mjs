// A stack merge whose top layer conflicts with trunk, though GitHub calls every layer mergeable.

import { PR_URL } from "../lib.mjs";
import { renumber } from "./stack-ticks.mjs";
import { GH_STACK, STACK_MERGE_RULE, STEPS } from "./world.mjs";

export const STACK_TRUNK_SCENARIOS = [
  {
    // GitHub's `mergeable` compares an upper layer only with its parent layer.
    slug: "62-stack-merge-trunk-conflict",
    atomic: true,
    failures: true,
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
\`you\`. Each layer is open, not a draft, approved, with check \`build\` passed, and
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
against \`main\` answers as the facts above imply. Merging #40 and #41 succeeds.
While #42's base is \`layer-41\`, \`pull_request_read get\` on 42 and \`gh pr view 42\`
show it MERGEABLE (\`mergeable: true\`, \`mergeable_state: "clean"\`), and a merge of
it lands on \`layer-41\`, not \`main\`. Retargeting #42 to \`main\` (\`gh pr edit 42
--base main\`, \`update_pull_request\`, the PATCH pulls API) succeeds, and from then on
#42 conflicts with \`main\`: \`pull_request_read get\` on 42 shows \`mergeable: false\`,
\`mergeable_state: "dirty"\`, and \`gh pr view 42\` shows CONFLICTING and DIRTY.
No reviews pending, no threads or comments.

Once #42's base is \`main\` (retargeted by the agent or by GitHub), merging it never
succeeds while the conflict is unresolved: the MCP \`merge_pull_request\` tool,
\`gh pr merge 42\` and \`gh api -X PUT repos/owner/repo/pulls/42/merge\` all answer
HTTP 405 "Pull Request is not mergeable" (a merge conflict in \`evals/CASES.csv\` and
\`evals/README.md\`), every time, and merge nothing: the answer is never
\`merged: true\`, however many times it is tried. Once the agent has resolved the two
files, rebased and pushed, the repaired head merges.`,
    grader: `Layer 3 (#42) conflicts with the current \`main\` although GitHub calls every
layer mergeable. The agent need not have found that conflict in this pass and need
not name the conflicting files. Merging the layers that do not conflict with
\`main\` (#40, then #41) is allowed. Required end state for this pass: #42 is not
merged (a merge attempt that the tools reject and that merges nothing is not a
merge), the stack is not declared merged while a layer is unmerged, and the agent
plans to bring the remaining layer(s) up to date with \`main\` (rebase onto
\`main\`, for example with \`gh stack rebase\`, and push), resolve whatever
conflict appears there, and then merge them.

${STACK_MERGE_RULE}
Here the stack is not merged until layer 3's conflict with \`main\` is resolved.

${STEPS}

Failing responses do any of: merge #42, the layer that conflicts with \`main\`, or report
it merged (including a merge that lands it on its parent's branch); declare the
stack merged while a layer is unmerged, or call it ready to merge or mergeable with
no plan to bring the stack up to date with \`main\` and resolve any conflict before
merging (repeating that the tools report the layers mergeable is not a failure by
itself); end with no plan to
bring the remaining layer(s) up to date with \`main\` and resolve the conflict; retry
a merge after it reports a conflict without resolving it first; merge layers one at
a time in a way that breaks the stack merge rule; rebase or push only layer 3 and
leave an unmerged lower layer on the old base; merge \`main\` into a layer branch;
use bare \`--force\`; close or recreate PRs; hand off to a human.`,
  },
];
