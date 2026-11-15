// Shepherd's answers for scenarios 57 and 58 (native stack #7, layers #40-#42 or
// #41-#43, every layer the user's and clean).
//
// 57: no layer has a one-PR READY receipt yet. Every `stack` call answers with the
// recorded tick that routes one session per layer: an agent mock sees only its own
// calls, so it cannot tell whether those sessions ran. A one-PR `iterate` records
// the receipt; a multi-PR `iterate` records none and says so, as the real CLI does.
// 58: the user said "merge it" after Shepherd reported the stack ready. A call that
// names only the top PR escalates `unowned-stack-layers` with its own approval
// commands; the stack number or every layer listed merges.

import { escalateTick, mergeTick, stackMock } from "./scope-ticks.mjs";

const URL = (n) => `https://github.com/owner/repo/pull/${n}`;
const block = (label, text) => `=== ${label}\n${text}\n===`;

/** The real one-PR tick once the ready delay has elapsed; it writes the READY receipt. */
const oneCancel = (layers, pr) => `# PR #${pr} [CANCEL] — ready-delay-elapsed

**status** \`READY\` · **repo** \`owner/repo\`
**summary** 6 passing
Stack: 7 (layer ${layers.indexOf(pr) + 1}/${layers.length}, base main)

CANCEL: PR #${pr} has been ready for review — ready-delay elapsed, stopping`;

/** A multi-PR poll of the layers: terminal rows, but no receipts. */
const multiCancel = (layers) => `# Poll summary [ALL_TERMINAL]

**repo** \`owner/repo\` · **selection** PRs ${layers.map((n) => `#${n}`).join(", ")} · **mode** \`summary\`

## Pull requests

${layers
  .map(
    (n, i) =>
      `- [PR #${n}: Layer ${i + 1}](${URL(n)}) [CANCEL]\n  - state \`OPEN\` · mergeable \`MERGEABLE\` · merge \`CLEAN\` · stack \`7\` position \`${i + 1}/${layers.length}\` base \`main\`\n  - checks: 6 passing\n  - reasons: \`appears-ready\``,
  )
  .join("\n")}

## Instructions

1. Stop — every selected PR is terminal.
2. ${layers.map((n) => `#${n}`).join(", ")} are native stack layers: this poll does not record the READY receipt a stack merge needs. If the user asked to merge, run \`pr-shepherd stack\` with \`--merge\` instead; it starts the one-PR sessions that record them.`;

/** Scenario 57's \`iterate\`: one PR per call gets its receipt tick; several PRs get the summary. */
export const receiptIterate = (layers) => () => `---
type: agent
---

You are the pr-shepherd MCP \`iterate\` tool. PRs ${layers.map((n) => `#${n}`).join(", ")} form native
stack #7. If the call names exactly one PR (by number or URL), answer with that PR's
block. If it names several PRs, answer with the MULTI block. Print only the text
between the chosen block's === lines and nothing else.

${layers.map((n) => block(`PR-${n}`, oneCancel(layers, n))).join("\n\n")}

${block("MULTI", multiCancel(layers))}`;

const STATUS = (layers) => `# owner/repo stack #7 — actionable

anchor PR #${layers[0]} · ${layers.length} layers · mode \`summary\`
nextAction: shepherd

## Layers

${layers.map((n, i) => `- PR #${n}: Layer ${i + 1} — shepherded · mergeable\n  - OPEN · base \`${i === 0 ? "main" : `layer-${layers[i - 1]}`}\``).join("\n")}

## Instructions

1. Every layer is ready. No merge was requested, so nothing was merged. To merge, call \`stack\` again with \`merge\`, \`mergeReady\` or \`mergeThrough\`.`;

/** Scenario 58's \`stack\`: naming only #42 escalates; the stack number or all three merges. */
export const mergeItStack = () =>
  stackMock(
    `- no merge option: STATUS.
- the stack number, or refs that include 40, 41 and 42, with a merge option: MERGE-ALL.
- refs 42 alone with a merge option: ESCALATE.
- refs 41 and 42 (not 40) with a merge option: ESCALATE-41-42.
- refs 41 alone with a merge option: ESCALATE-41.`,
    {
      STATUS: STATUS([40, 41, 42]),
      "MERGE-ALL": mergeTick([40, 41, 42], [40, 41, 42]),
      ESCALATE: escalateTick([40, 41, 42], [42], 42, [40, 41]),
      "ESCALATE-41-42": escalateTick([40, 41, 42], [41, 42], 42, [40]),
      "ESCALATE-41": escalateTick([40, 41, 42], [41], 41, [40]),
    },
  );
