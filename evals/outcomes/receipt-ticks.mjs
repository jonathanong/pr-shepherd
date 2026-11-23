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

import { STATUS, escalateTick, mergeTick, stackMock } from "./scope-ticks.mjs";

const URL = (n) => `https://github.com/owner/repo/pull/${n}`;
const block = (label, text) => `=== ${label}\n${text}\n===`;

/** The real one-PR tick once the ready delay has elapsed; it writes the READY receipt. */
export const oneCancel =(layers, pr) => `# PR #${pr} [CANCEL] — ready-delay-elapsed

**status** \`READY\` · **repo** \`owner/repo\`
**summary** 6 passing
Stack: 7 (layer ${layers.indexOf(pr) + 1}/${layers.length}, base ${layers.indexOf(pr) === 0 ? "main" : `layer-${layers.indexOf(pr)}`})

CANCEL: PR #${pr} has been ready for review — ready-delay elapsed, stopping`;

/** A multi-PR poll of the layers: terminal rows, but no receipts. */
export const multiCancel =(layers) => `# Poll summary [ALL_TERMINAL]

**repo** \`owner/repo\` · **selection** PRs ${layers.map((n) => `#${n}`).join(", ")} · **mode** \`summary\`

## Pull requests

${layers
  .map(
    (n, i) =>
      `- [PR #${n}: Layer ${i + 1}](${URL(n)}) [CANCEL]\n  - state \`OPEN\` · mergeable \`MERGEABLE\` · merge \`CLEAN\` · stack \`7\` position \`${i + 1}/${layers.length}\` base \`${i === 0 ? "main" : `layer-${i}`}\`\n  - checks: 6 passing\n  - reasons: \`appears-ready\``,
  )
  .join("\n")}

## Instructions

1. Stop — every selected PR is terminal.
2. ${layers.map((n) => `#${n}`).join(", ")} are native stack layers: this poll does not record the READY receipt a stack merge needs. If the user asked to merge, run \`pr-shepherd stack\` with \`--merge\` instead; it starts the one-PR sessions that record them.`;

/** Scenario 57's \`iterate\`: one PR per call gets its receipt tick; several PRs get the summary. */
export const receiptIterate = (layers) => () => `---
type: agent
---

PRs ${layers.map((n) => `#${n}`).join(", ")} form native stack #7. If the call names exactly one PR
(by number or URL), answer with that PR's block. If it names several PRs, answer
with the MULTI block. Print only the text
between the chosen block's === lines and nothing else.

${layers.map((n) => block(`PR-${n}`, oneCancel(layers, n))).join("\n\n")}

${block("MULTI", multiCancel(layers))}`;

/** Scenario 58's \`stack\`: naming only #42 escalates; the stack number or all three merges. */
export const mergeItStack = () =>
  stackMock(
    `- no merge flag: STATUS.
- the stack number, or PRs that include 40, 41 and 42, with a merge flag: MERGE-ALL.
- PR 42 alone with a merge flag: ESCALATE.
- PRs 41 and 42 (not 40) with a merge flag: ESCALATE-41-42.
- PR 41 alone with a merge flag: ESCALATE-41.`,
    {
      STATUS: STATUS([40, 41, 42]),
      "MERGE-ALL": mergeTick([40, 41, 42], [40, 41, 42]),
      ESCALATE: escalateTick([40, 41, 42], [42], 42, [40, 41]),
      "ESCALATE-41-42": escalateTick([40, 41, 42], [41, 42], 42, [40]),
      "ESCALATE-41": escalateTick([40, 41, 42], [41], 41, [40]),
    },
  );

/**
 * Scenario 57's `stack`: the recorded no-receipts tick until the one-PR sessions ran, then the
 * merge tick (snapshot 97's text with this stack's layer names). A mock answers per call, so it
 * reads its own history: every layer needs a single-PR call, which records its receipt.
 */
export const receiptStack = (layers) => (recorded) =>
  stackMock(
    `- Look at the earlier calls in your history. A call is a "one-PR session" when its
  arguments are a single PR number or URL (no \`stack\` word) and no other PR. If one-PR sessions
  for every one of ${layers.map((n) => `#${n}`).join(", ")} were already answered earlier in this
  conversation, answer MERGE.
- Otherwise answer RECEIPTS.`,
    {
      RECEIPTS: recorded,
      MERGE: mergeTick(layers, layers)
        .replaceAll(`layer-${layers[0]}`, "layer-1")
        .replaceAll(`layer-${layers[1]}`, "layer-2"),
    },
  );
