// Argument-dependent `stack` answers for scenarios 36 and 37 (stack #7, layers
// #40/#41/#42 or #41/#42/#43). They follow the real CLI: listed PRs are the only
// ones owned, a stack number owns every layer, and a merge covers the owned
// layers. So a call that claims too much gets the merge it would really emit,
// and one that leaves out a lower layer escalates.

const URL = (n) => `https://github.com/owner/repo/pull/${n}`;

const layerRows = (layers, owned) =>
  layers
    .map(
      (n, i) =>
        `- PR #${n}: Layer ${i + 1} — shepherded · mergeable${owned.includes(n) ? " · owned" : ""}\n  - OPEN · base \`${i === 0 ? "main" : `layer-${layers[i - 1]}`}\``,
    )
    .join("\n");

/** A merge that lands `merged` (a bottom prefix of `layers`); the rest stay open above it. */
export const mergeTick = (layers, merged, owned = layers) => {
  const top = merged.at(-1);
  const above = layers.filter((n) => !merged.includes(n));
  const stays = above.length
    ? ` ${above.map((n) => `#${n}`).join(", ")} stays open above it (not owned); GitHub retargets it onto \`main\`.`
    : "";
  return `# owner/repo stack #7 — actionable

anchor PR #${layers[0]} · ${layers.length} layers · mode \`summary\`
stackMergeable: true
nextAction: merge

## Layers

${layerRows(layers, owned)}

## Instructions

1. Run \`GH_REPO=owner/repo gh stack merge ${top} --yes --squash\` in \`owner/repo\` to merge PRs ${merged.map((n) => `#${n}`).join(", ")} of stack #7.${stays} One command lands every listed layer. Do not merge the layers one at a time with \`gh pr merge\`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If \`gh stack\` is an unknown command, run \`gh extension install github/gh-stack\`, then rerun that merge command.
2. After the merge attempt, rerun the same \`stack\` call; GitHub retargets the next layer onto \`main\`. Shepherd any layer that GitHub rejects or ejects.`;
};

/**
 * Fixture 182's escalation: merging `top` also lands the unlisted `lower` layers. `flag` is the
 * call's merge option, which the printed approval commands keep; `authors` maps PR to login.
 */
export const escalateTick = (
  layers,
  owned,
  top,
  lower,
  { flag = "--merge", authors = {} } = {},
) => `# owner/repo stack #7 [ESCALATE] — actionable

anchor PR #${layers[0]} · ${layers.length} layers · mode \`summary\`
nextAction: escalate

## Layers

${layerRows(layers, owned)}

## Instructions

1. \`unowned-stack-layers\`: merging PR #${top} also merges ${lower.map((n) => `#${n} (@${authors[n] ?? "you"}, "Layer ${layers.indexOf(n) + 1}")`).join(", ")}, which you did not list as yours. Nothing was merged, and never merge only #${top} while leaving ${lower.length === 1 ? "that layer" : "those layers"} open. Stop and tell the user that merging #${top} also merges ${lower.map((n) => `#${n}`).join(", ")}. If they approve, run \`pr-shepherd stack ${[...lower, ...owned]
  .sort((a, b) => a - b)
  .map(URL)
  .join(
    " ",
  )} --until-terminal ${flag}\` (lists ${lower.map((n) => `#${n}`).join(", ")} as yours too) or \`pr-shepherd stack "owner/repo#7" --until-terminal ${flag}\` (the stack number owns every layer). Otherwise wait for ${lower.length === 1 ? "its owner" : "their owners"}.`;

const block = (label, text) => `=== ${label}\n${text}\n===`;

/** `iterate` on a stacked layer routes it to `stack` (src/commands/iterate/merge-state.mts). */
const route = (layers, pr) => `# PR #${pr} [TRIAGE]

**status** \`READY\`
**summary** 1 passing
Stack: 7 (layer ${layers.indexOf(pr) + 1}/${layers.length}, base ${layers.indexOf(pr) === 0 ? "main" : `layer-${layers[layers.indexOf(pr) - 1]}`})

## Instructions

1. PR #${pr} is layer ${layers.indexOf(pr) + 1} of ${layers.length} in native stack #7; do not run \`gh pr merge\` for this layer.
2. Run \`pr-shepherd stack ${URL(pr)} --until-terminal --merge-through ${URL(pr)}\` to merge this layer and the unmerged layers below it, never a layer above it. If lower layers are not yours it escalates \`unowned-stack-layers\` and merges nothing: report that to the user. Otherwise it emits one merge command that lands every layer it lists. Run that command as printed: do not merge the layers one at a time with \`gh pr merge\`, and do not rebase or push between layers.`;

/** An `iterate` mock for stack #7 that answers each PR in the call with its route. */
export const routeMock = (layers) => () => `---
type: agent
---

You are the pr-shepherd MCP \`iterate\` tool. PRs ${layers.map((n) => `#${n}`).join(", ")} form native
stack #7. Answer with the block for each PR in the call (number or URL), in the
call's order, separated by a blank line. Print only the text between each block's
=== lines and nothing else.

${layers.map((n) => block(`PR-${n}`, route(layers, n))).join("\n\n")}`;

/** An agent mock for `stack` that picks one labelled answer by the call's arguments. */
export const stackMock = (rules, answers) => `---
type: agent
---

You are the pr-shepherd MCP \`stack\` tool. Read the call's \`refs\` (PR numbers
or URLs, or the stack number \`owner/repo#7\`) and its \`merge\`, \`mergeThrough\`
and \`mergeReady\` options, then pick one answer:
${rules}
Answer with exactly the text between that answer's === lines. Print nothing else.

${Object.entries(answers)
  .map(([label, text]) => block(label, text))
  .join("\n\n")}`;

const STATUS = (layers) => `# owner/repo stack #7 — actionable

anchor PR #${layers[0]} · ${layers.length} layers · mode \`summary\`
nextAction: shepherd

## Layers

${layerRows(layers, [])}

## Instructions

1. Every layer is ready. No merge was requested, so nothing was merged. To merge, call \`stack\` again with \`merge\`, \`mergeReady\` or \`mergeThrough\`.`;

/** Scenario 36: #40 is a teammate's; the user asked for #41 and #42. */
export const scope36 = (recorded) =>
  stackMock(
    `- no merge option: STATUS.
- the stack number, or refs that include 40, with a merge option: MERGE-ALL.
- refs 41 and 42 (not 40) with a merge option: ESCALATE.
- refs 42 alone with a merge option: ESCALATE-42.
- refs 41 alone with a merge option: ESCALATE-41.`,
    {
      STATUS: STATUS([40, 41, 42]),
      "MERGE-ALL": mergeTick([40, 41, 42], [40, 41, 42]),
      ESCALATE: recorded,
      "ESCALATE-42": escalateTick([40, 41, 42], [42], 42, [40, 41], { authors: { 40: "teammate" } }),
      "ESCALATE-41": escalateTick([40, 41, 42], [41], 41, [40], { authors: { 40: "teammate" } }),
    },
  );

/** Scenario 37: #43 is a teammate's; the user asked for the stack up to #42. */
export const scope37 = (recorded) =>
  stackMock(
    `- no merge option: STATUS.
- \`mergeThrough\` 42 with the stack number or refs 41 and 42: THROUGH.
- refs 41 and 42 (not 43) with \`merge\` or \`mergeReady\`: THROUGH.
- the stack number, or refs that include 43, with \`merge\` or \`mergeReady\`: MERGE-ALL.
- refs 42 alone with \`mergeThrough\` 42: ESCALATE-42-THROUGH.
- refs 42 alone with \`merge\` or \`mergeReady\`: ESCALATE-42.
- \`mergeThrough\` 41, or refs 41 alone with a merge option: MERGE-41.`,
    {
      STATUS: STATUS([41, 42, 43]),
      THROUGH: recorded,
      "MERGE-ALL": mergeTick([41, 42, 43], [41, 42, 43]),
      "ESCALATE-42-THROUGH": escalateTick([41, 42, 43], [42], 42, [41], {
        flag: `--merge-through ${URL(42)}`,
      }),
      "ESCALATE-42": escalateTick([41, 42, 43], [42], 42, [41]),
      "MERGE-41": mergeTick([41, 42, 43], [41], [41]),
    },
  );
