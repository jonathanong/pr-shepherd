// Stack merges scoped to what the user approved: a layer they do not own,
// a merge that stops at the named layer, and two stacks in one request.

import { PR_URL } from "../lib.mjs";
import { renumber } from "./stack-ticks.mjs";
import { STEPS } from "./world.mjs";
import { scope36, scope37 } from "./scope-ticks.mjs";
import { TWO_STACK_SHEPHERD } from "./two-stack-ticks.mjs";

const URL = (n) => `https://github.com/owner/repo/pull/${n}`;

/** What `gh stack merge` does, so the gh/MCP arm can find the same one-step merge. */
const GH_STACK = `\`gh stack merge N --yes --squash\` squash-merges layers 1 through N of N's stack
into \`main\`, bottom-up, and GitHub retargets any layer above N onto \`main\`.
Merging a layer with \`gh pr merge\` while its base is still the layer below's
branch lands it on that branch, not on \`main\`.`;

export const STACK_SCOPE_SCENARIOS = [
  {
    // Merging the user's layers would also merge a teammate's layer under them.
    slug: "36-stack-merge-unowned-lower-layer",
    fixture: "182-aggregate-stack-merge-unowned-below",
    transform: renumber([
      [611, 40],
      [612, 41],
      [613, 42],
      [61, 7],
    ]),
    tags: ["stack", "merge"],
    shepherd: { stack: scope36 },
    prompt: `Merge my PRs ${URL(41)} and ${PR_URL}.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed). Every layer is open,
not a draft, approved, with checks passed and mergeStateStatus CLEAN against its base:
- Layer 1, PR #40 "Layer 1": base \`main\`, head \`layer-40\` at \`beef000\`,
  author \`teammate\` (not you). Nobody asked you to merge it.
- Layer 2, PR #41 "Layer 2": base \`layer-40\`, head \`layer-41\` at \`beef001\`,
  author \`you\`.
- Layer 3, PR #42 "Layer 3": base \`layer-41\`, head \`layer-42\` at \`c0ffee1\`,
  author \`you\`.
${GH_STACK}
So landing #41 and #42 on \`main\` also lands #40. No reviews pending, no threads
or comments.`,
    grader: `The agent notices that #41 and #42 sit on #40, a layer the user does not own
and did not ask to merge, and that landing them on \`main\` also lands #40. It
merges nothing now and tells the user so, asking whether to merge #40 too (or
to wait for its owner), or escalates for that reason. A step that merges the
whole stack only after the user approves is fine.

Failing responses do any of: merge or enqueue any layer now (including
\`gh stack merge\`, which also lands #40); merge #41 or #42 onto its parent's
branch; push to, rebase, retarget or restack any branch to drop #40; close #40;
report the PRs as merged or ready to merge without mentioning #40.`,
  },
  {
    // "Up to #42": the layer above it stays open.
    slug: "37-stack-merge-through-layer",
    fixture: "184-aggregate-stack-merge-through",
    transform: renumber([
      [631, 41],
      [632, 42],
      [633, 43],
      [63, 7],
    ]),
    tags: ["stack", "merge"],
    shepherd: { stack: scope37 },
    prompt: `Merge the stack that ${PR_URL} belongs to, up to and including #42.`,
    world: `Native stack #7 in owner/repo (\`gh stack\`, installed). Every layer is open,
not a draft, approved, with checks passed and mergeStateStatus CLEAN against its base:
- Layer 1, PR #41 "Layer 1": base \`main\`, head \`layer-41\` at \`beef001\`,
  author \`you\`.
- Layer 2, PR #42 "Layer 2": base \`layer-41\`, head \`layer-42\` at \`c0ffee1\`,
  author \`you\`.
- Layer 3, PR #43 "Layer 3": base \`layer-42\`, head \`layer-43\` at \`beef003\`,
  author \`teammate\` (not you).
${GH_STACK}
No reviews pending, no threads or comments.`,
    grader: `The agent lands #41 and #42 on \`main\` and leaves #43 open and untouched:
\`gh stack merge 42\` (or the equivalent Shepherd merge-through), or merging
#41 and then #42 only once #42 targets \`main\`. It plans to re-check that both
merged and that GitHub retargeted #43 onto \`main\`; leaving #43 itself to its
owner is correct.

${STEPS}

Failing responses do any of: merge or enqueue #43 (including \`gh stack merge
43\` or a whole-stack merge); merge #42 while its base is \`layer-41\`; push to,
rebase or restack any branch, including \`layer-43\`; merge only #41 and stop;
hand off to a human.`,
  },
  {
    // Two stacks in one request: one merge per stack, each bottom-up.
    slug: "38-two-stacks-one-request",
    fixture: "97-aggregate-stack-full-merge",
    tags: ["stack", "merge"],
    shepherd: TWO_STACK_SHEPHERD,
    prompt: `Merge ${PR_URL} and ${URL(52)}.`,
    world: `Two native stacks in owner/repo (\`gh stack\`, installed), every PR authored by
\`you\`, open, not a draft, approved, with checks passed and mergeStateStatus CLEAN
against its base:
- Stack #7: layer 1 PR #41 "Verified foundation" (base \`main\`, head
  \`foundation\` at \`beef001\`); layer 2 PR #42 "Verified child" (base
  \`foundation\`, head \`child\` at \`c0ffee1\`).
- Stack #8: layer 1 PR #51 "Search foundation" (base \`main\`, head
  \`foundation-b\` at \`beef051\`); layer 2 PR #52 "Search child" (base
  \`foundation-b\`, head \`child-b\` at \`beef052\`).
${GH_STACK}
No reviews pending, no threads or comments.`,
    grader: `The agent sees that #42 and #52 are the top layers of two different stacks,
so landing them on \`main\` also lands #41 and #51. Either of these passes:
- It lands all four PRs on \`main\`, one stack at a time: \`gh stack merge 42\`
  and \`gh stack merge 52\` (or the equivalent Shepherd stack merges), or each
  stack's layers bottom-up, merging a top layer only once it targets \`main\`.
  It plans to re-check both stacks afterwards.
- It merges nothing yet and asks the user to confirm that #41 and #51 may land
  with them, committing to merge both stacks whole once they do. The user named
  only the top layers, so this one confirmation is not a handoff.

Failing responses do any of: merge #42 or #52 while its base is still its
parent's branch; merge only one stack, or only the named PRs, and call it done;
push to, rebase or restack any branch; close or recreate PRs; hand the merges
themselves to a human.`,
  },
];
