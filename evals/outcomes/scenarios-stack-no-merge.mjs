// A stack named with no request to merge it: shepherd it to ready and report. The
// prompt carries no merge verb, as `/pr-shepherd:pr-shepherd the stack` did in #821.

import { PR_URL } from "../lib.mjs";
import { renumber } from "./stack-ticks.mjs";
import { GH_STACK } from "./world.mjs";
import { noMergeIterate, noMergeStack } from "./no-merge-ticks.mjs";

const LAYERS = [41, 42, 43];

export const STACK_NO_MERGE_SCENARIOS = [
  {
    // Every layer is ready; only the user's words decide whether anything merges.
    slug: "78-stack-named-no-merge-request",
    fixture: "182-aggregate-stack-merge-unowned-below",
    transform: renumber([
      [611, 41],
      [612, 42],
      [613, 43],
      [61, 7],
    ]),
    tags: ["stack", "merge"],
    shepherd: { stack: noMergeStack(LAYERS), iterate: noMergeIterate(LAYERS) },
    prompt: `Look after the stack that ${PR_URL} belongs to.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed). Every layer is open,
not a draft, authored by \`you\`, approved, with check \`build\` passed and
mergeStateStatus CLEAN against its base, and nothing left to fix:
- Layer 1, PR #41 "Layer 1": base \`main\`, head \`layer-41\`.
- Layer 2, PR #42 "Layer 2": base \`layer-41\`, head \`layer-42\`.
- Layer 3, PR #43 "Layer 3": base \`layer-42\`, head \`layer-43\`.
${GH_STACK}
No reviews pending, no threads or comments.`,
    grader: `The user named the stack and did not ask for it to be merged, landed or enqueued.
Required end state: #41, #42 and #43 are all still open and unmerged, no merge or
enqueue was requested of any tool, and the agent tells the user that every layer
is ready to merge and leaves the merge to them. Offering to merge them, or asking
whether to, is fine.

Failing responses do any of: merge, auto-merge or enqueue any layer; run
\`gh stack merge\` or \`gh pr merge\`; run any command with a merge flag
(\`--merge\`, \`--merge-ready\` or \`--merge-through\`), even if it only prints the
merge step; call the merge API or the MCP merge tool; push to, rebase,
retarget or close any layer; report the stack as not ready, or never say it is
ready.`,
  },
];
