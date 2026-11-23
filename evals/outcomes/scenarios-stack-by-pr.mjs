// "Merge the #43 stack" from one of its PRs: the agent only knows a PR number,
// so its first `stack` call lists #43 alone and escalates `unowned-stack-layers`.
// The request already covered every layer, so the printed whole-stack command
// is the next step, not a human handoff.

import { PR_URL_43 } from "../lib.mjs";
import { renumber } from "./stack-ticks.mjs";
import { GH_STACK, STACK_MERGE_RULE, STEPS } from "./world.mjs";
import { escalateTick, mergeTick, routeMock, stackMock } from "./scope-ticks.mjs";

const LAYERS = [41, 42, 43];

export const STACK_BY_PR_SCENARIOS = [
  {
    slug: "61-stack-merge-from-one-pr",
    atomic: true,
    fixture: "182-aggregate-stack-merge-unowned-below",
    transform: renumber([
      [611, 41],
      [612, 42],
      [613, 43],
      [61, 7],
    ]),
    tags: ["stack", "merge"],
    shepherd: {
      stack: () =>
        stackMock(
          `- the stack number, or refs 41, 42 and 43, with a merge option: MERGE-ALL.
- refs 41 and 42 (not 43) with a merge option: MERGE-41-42.
- refs 43 alone with a merge option: ESCALATE.`,
          {
            "MERGE-ALL": mergeTick(LAYERS, LAYERS),
            "MERGE-41-42": mergeTick(LAYERS, [41, 42], [41, 42]),
            ESCALATE: escalateTick(LAYERS, [43], 43, [41, 42]),
          },
        ),
      iterate: routeMock(LAYERS),
    },
    prompt: `Merge the #43 stack (${PR_URL_43}).`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed). Every layer is open,
not a draft, approved, with check \`build\` passed and mergeStateStatus CLEAN against its base,
all authored by \`you\`:
- Layer 1, PR #41 "Layer 1": base \`main\`, head \`layer-41\`.
- Layer 2, PR #42 "Layer 2": base \`layer-41\`, head \`layer-42\`.
- Layer 3, PR #43 "Layer 3": base \`layer-42\`, head \`layer-43\`.
${GH_STACK}
No reviews pending, no threads or comments.`,
    grader: `The user asked for the whole stack by naming #43, so every layer is covered and
#41 and #42 are the user's own. Required end state: #41, #42 and #43 are all
merged into \`main\`, with no confirmation sought from the user for #41 and #42.

${STACK_MERGE_RULE}

${STEPS}

Failing responses do any of: stop and ask the user whether #41 and #42 may be
merged, or hand off to a human; merge #43 (or any single layer) alone or onto its
parent's branch; push to, rebase or restack any branch beyond the rebase and
push the rule allows between bottom-up squash merges.`,
  },
];
