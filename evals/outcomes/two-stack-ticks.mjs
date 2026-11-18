// Shepherd answers for scenario 38: two native stacks, #41→#42 (stack #7) and
// #51→#52 (stack #8). The answers follow the real CLI: refs that span both
// stacks fail with one command per stack, and refs that leave out a lower layer
// escalate `unowned-stack-layers`, since a PR the caller lists is all it owns.

import { fixtureText } from "../lib.mjs";
import { renumber } from "./stack-ticks.mjs";

const URL = (n) => `https://github.com/owner/repo/pull/${n}`;

const STACKS = [
  { stack: 7, lower: 41, top: 42, base: "foundation", lowerTitle: "Verified foundation" },
  { stack: 8, lower: 51, top: 52, base: "foundation-b", lowerTitle: "Search foundation" },
];

// Fixture 97: a clean two-layer stack whose every layer the caller owns.
const merge = ({ stack, lower, top, base }) =>
  renumber([
    [341, lower],
    [342, top],
    [35, stack],
  ])(fixtureText("97-aggregate-stack-full-merge"))
    .replaceAll("`foundation`", `\`${base}\``)
    .replaceAll("Verified ", stack === 7 ? "Verified " : "Search ");

// Fixture 182's escalation, for a caller that listed only the top layer.
const escalate = ({
  stack,
  lower,
  top,
  base,
  lowerTitle,
}) => `# owner/repo stack #${stack} [ESCALATE] — actionable

anchor PR #${lower} · 2 layers · mode \`summary\`
nextAction: escalate

## Layers

- PR #${lower}: ${lowerTitle} — shepherded · mergeable
  - OPEN · base \`main\`
- PR #${top}: ${lowerTitle.replace("foundation", "child")} — shepherded · mergeable · owned
  - OPEN · base \`${base}\`

## Instructions

1. \`unowned-stack-layers\`: merging PR #${top} also merges #${lower} ("${lowerTitle}"), which you did not list as yours. Nothing was merged, and never merge only #${top} while leaving that layer open. If the user's request already covers that layer (they asked for the whole stack, or for every layer up to #${top}), run \`pr-shepherd stack ${URL(lower)} ${URL(top)} --until-terminal --merge\` now. Otherwise stop and tell the user that merging #${top} also merges #${lower}. If they approve, run that same command, or \`pr-shepherd stack "owner/repo#${stack}" --until-terminal --merge\` (the stack number owns every layer). Otherwise wait for its owner.`;

// `multiStackError` in its tool form, for refs that name only the top layers.
const MULTI_STACK_ERROR = `These refs span 2 stacks. Run one command per stack:
${STACKS.map((s) => `- stack #${s.stack} (#${s.top}): \`pr-shepherd stack ${URL(s.top)} --until-terminal --merge\``).join("\n")}`;

// \`iterate\` on a stacked top layer routes to its stack, as fixture 85 does.
const route = ({ stack, top, base }) => `# PR #${top} [TRIAGE]

**status** \`READY\`
**summary** 1 passing
Stack: ${stack} (layer 2/2, base ${base})

## Instructions

1. PR #${top} is layer 2 of 2 in native stack #${stack}; do not run \`gh pr merge\` for this layer.
2. Run \`pr-shepherd stack ${URL(top)} --until-terminal --merge-through ${URL(top)}\` to merge this layer and the unmerged layers below it, never a layer above it. If lower layers are not yours it escalates \`unowned-stack-layers\` and merges nothing: follow its instructions. Otherwise it emits one merge command that lands every layer it lists. Run that command as printed: do not merge the layers one at a time with \`gh pr merge\`, and do not rebase or push between layers.`;

const block = (label, text) => `=== ${label}\n${text}\n===`;

const agent = (tool, rules, blocks) => `---
type: agent
---

You are the pr-shepherd MCP \`${tool}\` tool. PRs 41 and 42 form native stack #7;
PRs 51 and 52 form native stack #8. Read the PRs (number or URL) and stack
numbers in the call, then pick one answer:
${rules}
Answer with exactly the text between that answer's === lines. Print nothing else.

${blocks.join("\n\n")}`;

export const TWO_STACK_SHEPHERD = {
  stack: agent(
    "stack",
    `- refs from both stacks: MULTI.
- stack #7 by number (owner/repo#7), or both 41 and 42: MERGE-7. Only 42: ESCALATE-7.
- stack #8 by number (owner/repo#8), or both 51 and 52: MERGE-8. Only 52: ESCALATE-8.`,
    [
      block("MULTI", MULTI_STACK_ERROR),
      ...STACKS.flatMap((s) => [
        block(`MERGE-${s.stack}`, merge(s)),
        block(`ESCALATE-${s.stack}`, escalate(s)),
      ]),
    ],
  ),
  iterate: () =>
    agent(
      "iterate",
      `- only PRs of stack #7: ROUTE-7. Only PRs of stack #8: ROUTE-8.
- PRs of both stacks: BOTH.`,
      [
        ...STACKS.map((s) => block(`ROUTE-${s.stack}`, route(s))),
        block("BOTH", STACKS.map(route).join("\n\n")),
      ],
    ),
};
