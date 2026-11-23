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
        `- PR #${n}: Layer ${i + 1} — shepherded · mergeable${owned.length < layers.length && owned.includes(n) ? " · owned" : ""}\n  - OPEN · base \`${i === 0 ? "main" : `layer-${layers[i - 1]}`}\``,
    )
    .join("\n");

/** The rerun the real CLI prints: the stack number when every layer is owned, else the listed layers. */
const rerunArgs = (layers, owned, through) =>
  through
    ? `${owned.map(URL).join(" ")} --until-terminal --merge-through ${URL(through)}`
    : owned.length === layers.length
      ? `"owner/repo#7" --until-terminal --merge`
      : `${owned.map(URL).join(" ")} --until-terminal --merge`;

/**
 * A merge that lands `merged` (a bottom prefix of `layers`); the rest stay open above it. Text as
 * in snapshots 97 and 184; `through` makes the rerun a `--merge-through` command, as in 184.
 */
export const mergeTick = (layers, merged, owned = layers, through = undefined) => {
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

1. Run \`GH_REPO=owner/repo gh stack merge ${top} --yes --squash\` in \`owner/repo\` to merge PRs ${merged.map((n) => `#${n}`).join(", ")} of stack #7.${stays} One command lands every listed layer. Do not merge the layers one at a time with \`gh pr merge\`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If \`gh stack\` is an unknown command, run \`gh extension install github/gh-stack\`, then rerun that merge command. If \`gh stack merge\` reports \`Merge conflict detected\`, nothing was merged. Do not rerun the merge; update the stack from its bottom layer onto trunk with \`gh stack rebase\`, then \`gh stack push\`, following the Branch update playbook, and rerun the stack command.
2. After the merge attempt, rerun \`pr-shepherd stack ${rerunArgs(layers, owned, through)}\`; GitHub retargets the next layer onto \`main\`. Shepherd any layer that GitHub rejects or ejects.`;
};

/** The printed command that approves `lower` by listing it with the owned layers. */
const listed = (lower, owned, flag) =>
  `pr-shepherd stack ${[...lower, ...owned]
    .sort((a, b) => a - b)
    .map(URL)
    .join(" ")} --until-terminal ${flag}`;

/**
 * Fixture 182's escalation: merging `top` also lands the unlisted `lower` layers. `flag` is the
 * call's merge flag, which the printed approval commands keep.
 */
export const escalateTick = (layers, owned, top, lower, { flag = "--merge" } = {}) => `# owner/repo stack #7 [ESCALATE] — actionable

anchor PR #${layers[0]} · ${layers.length} layers · mode \`summary\`
nextAction: escalate

## Layers

${layerRows(layers, owned)}

## Instructions

1. \`unowned-stack-layers\`: merging PR #${top} also merges ${lower.map((n) => `#${n} ("Layer ${layers.indexOf(n) + 1}")`).join(", ")}, which you did not list as yours. Nothing was merged, and never merge only #${top} while leaving ${lower.length === 1 ? "that layer" : "those layers"} open. If the user's request already covers ${lower.length === 1 ? "that layer" : "those layers"} (they asked for the whole stack, or for every layer up to #${top}), run \`${listed(lower, owned, flag)}\` now. Otherwise stop and tell the user that merging #${top} also merges ${lower.map((n) => `#${n}`).join(", ")}. If they approve, run that same command, or \`pr-shepherd stack "owner/repo#7" --until-terminal ${flag}\` (the stack number owns every layer). Otherwise wait for ${lower.length === 1 ? "its owner" : "their owners"}.`;

const block = (label, text) => `=== ${label}\n${text}\n===`;

/** `iterate` on a stacked layer routes it to `stack` (src/commands/iterate/merge-state.mts). */
export const route = (layers, pr) => `# PR #${pr} [TRIAGE]

**status** \`READY\`
**summary** 1 passing
Stack: 7 (layer ${layers.indexOf(pr) + 1}/${layers.length}, base ${layers.indexOf(pr) === 0 ? "main" : `layer-${layers[layers.indexOf(pr) - 1]}`})

## Instructions

1. PR #${pr} is layer ${layers.indexOf(pr) + 1} of ${layers.length} in native stack #7; do not run \`gh pr merge\` for this layer.
2. Run \`pr-shepherd stack ${URL(pr)} --until-terminal --merge-through ${URL(pr)}\` to merge this layer and the unmerged layers below it, never a layer above it. If lower layers are not yours it escalates \`unowned-stack-layers\` and merges nothing: follow its instructions. Otherwise it emits one merge command that lands every layer it lists. Run that command as printed: do not merge the layers one at a time with \`gh pr merge\`, and do not rebase or push between layers.`;

/** The `iterate` routing for stack #7: each PR in the call gets its route. */
export const routeMock = (layers) => () => `---
type: agent
---

PRs ${layers.map((n) => `#${n}`).join(", ")} form native stack #7. Answer with the block for each PR in
the call (number or URL), in the call's order, separated by a blank line. Print
only the text between each block's === lines and nothing else.

${layers.map((n) => block(`PR-${n}`, route(layers, n))).join("\n\n")}`;

/** An agent mock for `stack` that picks one labelled answer by the call's arguments. */
export const stackMock = (rules, answers) => `---
type: agent
---

Read the call's arguments (PR numbers or URLs, or the stack number
\`owner/repo#7\`) and its \`--merge\`, \`--merge-through PR\` and \`--merge-ready\`
flags, then pick one answer:
${rules}
Answer with exactly the text between that answer's === lines. Print nothing else.

${Object.entries(answers)
  .map(([label, text]) => block(label, text))
  .join("\n\n")}`;

/** A stack with every layer ready and no merge flag, as the real CLI stops on it. */
export const STATUS = (layers) => `# owner/repo stack #7 [CANCEL] — all_terminal

anchor PR #${layers[0]} · ${layers.length} layers · mode \`summary\`
stackMergeable: true
nextAction: cancel

## Layers

${layerRows(layers, [])}

## Instructions

1. Stop — every stack layer is terminal or fully READY.`;

/** Scenario 36: #40 is a teammate's; the user asked for #41 and #42. */
export const scope36 = (recorded) =>
  stackMock(
    `- no merge flag: STATUS.
- the stack number, or PRs that include 40, with a merge flag: MERGE-ALL.
- PRs 41 and 42 (not 40) with a merge flag: ESCALATE.
- PR 42 alone with a merge flag: ESCALATE-42.
- PR 41 alone with a merge flag: ESCALATE-41.`,
    {
      STATUS: STATUS([40, 41, 42]),
      "MERGE-ALL": mergeTick([40, 41, 42], [40, 41, 42]),
      ESCALATE: recorded,
      "ESCALATE-42": escalateTick([40, 41, 42], [42], 42, [40, 41]),
      "ESCALATE-41": escalateTick([40, 41, 42], [41], 41, [40]),
    },
  );

/** Scenario 37: #43 is a teammate's; the user asked for the stack up to #42. */
export const scope37 = (recorded) =>
  stackMock(
    `- no merge flag: STATUS.
- \`--merge-through\` 42 with the stack number or PRs 41 and 42: THROUGH.
- PRs 41 and 42 (not 43) with \`--merge\` or \`--merge-ready\`: THROUGH.
- the stack number, or PRs that include 43, with \`--merge\` or \`--merge-ready\`: MERGE-ALL.
- PR 42 alone with \`--merge-through\` 42: ESCALATE-42-THROUGH.
- PR 42 alone with \`--merge\` or \`--merge-ready\`: ESCALATE-42.
- \`--merge-through\` 41, or PR 41 alone with a merge flag: MERGE-41.`,
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
