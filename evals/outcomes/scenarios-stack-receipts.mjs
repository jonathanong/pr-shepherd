// Merging a whole native stack the user owns: the layers need their own one-PR
// READY receipts first (57), and "merge it" after a ready report covers every
// layer even when the first call names only the top PR (58).

import { PR_URL } from "../lib.mjs";
import { renumber } from "./stack-ticks.mjs";
import { STEPS } from "./world.mjs";
import { routeMock } from "./scope-ticks.mjs";
import { mergeItStack, receiptIterate } from "./receipt-ticks.mjs";

/** What `gh stack merge` does, so the gh/MCP arm can find the same one-step merge. */
const GH_STACK = `\`gh stack merge N --yes --squash\` squash-merges layers 1 through N of N's stack
into \`main\`, bottom-up, and GitHub retargets any layer above N onto \`main\`.
Merging a layer with \`gh pr merge\` while its base is still the layer below's
branch lands it on that branch, not on \`main\`.`;

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
    fixture: "198-aggregate-stack-merge-no-receipts",
    transform: renumber([
      [981, 41],
      [982, 42],
      [983, 43],
      [98, 7],
    ]),
    tags: ["stack", "merge"],
    shepherd: { iterate: receiptIterate([41, 42, 43]) },
    prompt: `Merge the stack that ${PR_URL} belongs to.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed). Every layer is open and
not a draft:
${LAYERS([41, 42, 43])}
${GH_STACK}
No reviews pending, no threads or comments.`,
    grader: `Success is the whole stack landing on \`main\` with one \`gh stack merge 43\` (or the
equivalent single command), after whatever verification the agent's tools require.
If a tool says each layer needs its own one-PR session first, the agent runs one
session per layer, each on its own (three separate one-PR runs, not one call that
names all three), then reruns the stack merge and runs the one merge command it
prints. Because this pass forbids re-checking, that rerun and merge may appear as
the next numbered steps, even if a repeated stack call in this pass still lists
the sessions.

${STEPS}

Failing responses do any of: merge the layers one at a time with \`gh pr merge\`;
treat one multi-PR poll of all three layers as those sessions and stop there;
merge only part of the stack; push to, rebase or retarget any branch; stop
without merging and without a concrete next step that merges; hand off to a human.`,
  },
  {
    // The user said "merge it" about a stack Shepherd already reported ready.
    slug: "58-stack-merge-it-after-ready-report",
    fixture: "182-aggregate-stack-merge-unowned-below",
    transform: renumber([
      [611, 40],
      [612, 41],
      [613, 42],
      [61, 7],
    ]),
    tags: ["stack", "merge"],
    shepherd: { stack: mergeItStack, iterate: routeMock([40, 41, 42]) },
    prompt: `You shepherded ${PR_URL} earlier and reported that every layer of its native
stack (#40, #41 and #42, all mine) is ready. Merge it.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed). Every layer is open and
not a draft:
${LAYERS([40, 41, 42])}
${GH_STACK}
No reviews pending, no threads or comments.`,
    grader: `"Merge it" means the whole stack: the user said all three layers are theirs and
ready. Success is #40, #41 and #42 landing on \`main\` with one \`gh stack merge 42\`
(or the equivalent single command). If a tool first refuses because the call named
only #42, the agent recognizes that the request already covers #40 and #41 and
reruns as that tool instructs, without asking the user again.

${STEPS}

Failing responses do any of: merge the layers one at a time with \`gh pr merge\`;
merge only #42 or only part of the stack; ask the user to confirm the lower layers
or hand off instead of merging; push to, rebase or retarget any branch.`,
  },
];
