// Native-stack scenarios (GitHub's `gh stack`). `world` is the GitHub state both
// tools answer from; `fixture` is the Shepherd tick for the same state.

import { PR_URL } from "../lib.mjs";
import { STEPS } from "./world.mjs";

const toOwnerRepo = (t) => t.replaceAll("vouchington/vouchington", "owner/repo");

export const STACK_SCENARIOS = [
  {
    // Rollup shows green, but the latest run of each required check was cancelled.
    slug: "27-stack-layer-cancelled-latest-run",
    fixture: "145-triage-stacked-layer-required-check-latest-run-cancelled",
    transform: (t) => toOwnerRepo(t).replaceAll("2687", "42").replaceAll("2688", "7"),
    tags: ["stack", "ci"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `PR #42 "Add pagination" in owner/repo: open, not a draft, head \`feature\` at
\`c0ffee1\`, author \`you\`, reviewDecision APPROVED. It is layer 2 of 2 in native
stack #7 (\`gh stack\`, installed), on top of layer 1 (PR #41, open). Its base is
layer 1's branch, which has no protection; the stack trunk \`main\` requires the
checks \`static\`, \`web\` and \`gitleaks\`. mergeStateStatus BLOCKED.

Workflow runs on \`c0ffee1\`, two per check:
- runs 100, 101, 102 (\`static\`, \`web\`, \`gitleaks\`): created 10:00, success,
  finished 10:09.
- runs 200, 201, 202 (same checks): created 10:05, cancelled at 10:06 by a
  concurrency group.
\`gh pr checks\` and the status rollup show all three as passing, because they
report the most recently finished run. GitHub's merge gate reads the most
recently created run of each required check, so it sees all three as
cancelled. No reviews pending, no threads or comments.`,
    grader: `The agent recognizes that the required checks are not actually green for the
merge gate, because the latest run of each was cancelled, and reruns runs 200,
201 and 202 (any mechanism counts). It makes no code change and does not call
the PR ready while those runs are cancelled.

${STEPS}

Failing responses do any of: report the PR as ready or its checks as passing;
merge or try to merge; change code for the cancellations; rerun the older
passing runs instead; hand off to a human.`,
  },
  {
    // A lower layer merged and this layer now conflicts with the trunk.
    slug: "28-native-stack-merged-parent",
    fixture: "129-triage-native-stack-merged-parent",
    transform: (t) => toOwnerRepo(t).replaceAll("2547", "42").replaceAll("2535", "7"),
    tags: ["stack", "conflicts"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `PR #42 "Add pagination" in owner/repo: open, not a draft, head \`feature\` at
\`c0ffee1\`, author \`you\`. It is layer 3 of 6 in native stack #7 (\`gh stack\`,
installed; \`gh stack checkout 7\` imports it locally). Layers 1 and 2 merged
into \`main\` an hour ago by squash, and GitHub retargeted #42 to \`main\`.
mergeStateStatus DIRTY: the branch still carries layers 1 and 2's original
commits, which conflict with their squashed versions on \`main\`. Layers 4-6
(#43, #44, #45, author \`you\`) sit on top of #42. Checks on \`c0ffee1\`:
\`build\` passed. No reviews, threads or comments.`,
    grader: `The agent rebases the stack onto the trunk with the stack tooling (\`gh stack
checkout 7\` if needed, then \`gh stack rebase\`) so layers 1 and 2's original
commits drop out and layers 4-6 stay on top, and pushes the rewritten stack
(\`gh stack push\`, or \`--force-with-lease\` for each rewritten layer), without
stopping to ask.

${STEPS}

Failing responses do any of: merge \`main\` into the branch; resolve the
conflict by hand on #42 alone, leaving layers 4-6 on the old commits; retarget
or close layers; use bare \`--force\`; hand off to the user.`,
  },
];
