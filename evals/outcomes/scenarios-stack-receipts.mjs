// Merging a whole native stack the user owns: the layers need their own one-PR
// READY receipts first (57), and "merge it" after a ready report covers every
// layer even when the first call names only the top PR (58).

import { PR_URL } from "../lib.mjs";
import { renumber } from "./stack-ticks.mjs";
import { GH_STACK, STACK_MERGE_RULE, STEPS } from "./world.mjs";
import { routeMock } from "./scope-ticks.mjs";
import { mergeItStack, receiptIterate, receiptStack } from "./receipt-ticks.mjs";

const LAYERS = (numbers) =>
  numbers
    .map(
      (n, i) =>
        `- Layer ${i + 1}, PR #${n} "Layer ${i + 1}": base \`${i === 0 ? "main" : `layer-${i}`}\`, head \`layer-${i + 1}\`,
  author \`you\`, approved, checks passed, mergeStateStatus CLEAN against its base.`,
    )
    .join("\n");

export const STACK_RECEIPT_SCENARIOS = [
  {
    // Every layer looks ready, but only multi-PR polls ran: no layer has a receipt.
    slug: "57-stack-merge-needs-receipts",
    atomic: true,
    fixture: "198-aggregate-stack-merge-no-receipts",
    transform: renumber([
      [981, 41],
      [982, 42],
      [983, 43],
      [98, 7],
    ]),
    tags: ["stack", "merge"],
    shepherd: { iterate: receiptIterate([41, 42, 43]), stack: receiptStack([41, 42, 43]) },
    prompt: `Merge the stack that ${PR_URL} belongs to.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed). Every layer is open and
not a draft:
${LAYERS([41, 42, 43])}
${GH_STACK}
No reviews pending, no threads or comments.`,
    grader: `Required end state: #41, #42 and #43 are all merged into \`main\`, after
whatever verification the agent chooses to do first. Because this pass forbids
re-checking, later steps may appear as the next numbered steps. A conditional
"if a layer turns out to be behind or conflicted, update it" is allowed; an
unconditional rebase or push before a merge that needs none is not. Retargeting
a layer from its parent's branch to \`main\` is part of landing it there, so it is
not an unneeded change.

${STACK_MERGE_RULE}

${STEPS}

Failing responses do any of: merge only part of the stack; push to or rebase
a branch when nothing said it was behind or conflicted, beyond the rebase and
push the rule allows between bottom-up squash merges; stop without merging
and without a concrete next step that merges; hand off to a human.`,
  },
  {
    // The user said "merge it" about a stack the agent already reported ready.
    slug: "58-stack-merge-it-after-ready-report",
    atomic: true,
    fixture: "182-aggregate-stack-merge-unowned-below",
    transform: renumber([
      [611, 40],
      [612, 41],
      [613, 42],
      [61, 7],
    ]),
    tags: ["stack", "merge"],
    shepherd: { stack: mergeItStack, iterate: routeMock([40, 41, 42]) },
    prompt: `Earlier you checked ${PR_URL} and reported that every layer of its native
stack (#40, #41 and #42, all mine) is ready. Merge it.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed). Every layer is open and
not a draft:
${LAYERS([40, 41, 42])}
${GH_STACK}
No reviews pending, no threads or comments.`,
    grader: `"Merge it" means the whole stack: the user said all three layers are theirs
and ready. Required end state: #40, #41 and #42 are all merged into \`main\`, with
no further confirmation asked of the user for the lower layers.

${STACK_MERGE_RULE}

${STEPS}

Failing responses do any of: merge only #42 or only part of the stack; ask the
user to confirm the lower layers or hand off instead of merging; push to or
rebase any branch beyond the rebase and push the rule allows between bottom-up
squash merges.`,
  },
];
