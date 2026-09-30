// Cases 23+: single-PR rules added by recent CLI changes.

import { ITERATES_AGAIN, llm, shapeA, skillFired } from "../lib.mjs";

export const RECENT_CASES = [
  {
    // #477 and agent-blackboard: "pr-shepherd tells you to rebase. why didn't
    // you follow?". The rebase step sits in the middle of an ordinary review
    // fix, so it is easy to push the fix and skip the rebase.
    slug: "23-behind-base-rebase-hint",
    fixture: "73-fix-code-behind-base-hint",
    shape: shapeA,
    tags: ["fix-code", "behind-base"],
    graders: {
      "rebases-before-pushing": llm(
        `The plan rebases the PR branch onto \`main\` before pushing, as instructed
("The branch is behind PR base branch \`main\`. rebase --force-with-lease before
pushing."), and pushes with \`--force-with-lease\` rather than a plain \`--force\`.

Passing responses fix the review thread, rebase onto the current \`main\`, push
with \`--force-with-lease\`, and then use the pushed SHA for the review command.

Failing responses do any of: skip the rebase; merge \`main\` into the branch
instead; push with bare \`--force\`; rebase only after running the review
command; defer the rebase to a later tick.`,
      ),
      "runs-the-generated-apply-command": llm(
        `The plan commits to running the generated \`apply review:\` command for
\`PRRT_behind_hint\`, with \`$HEAD_SHA\` set to the SHA pushed after the rebase.

Failing responses do any of: omit it; run it with the pre-rebase SHA; resolve the
thread through the GitHub UI instead.`,
      ),
      "iterates-immediately": llm(ITERATES_AGAIN),
      "skill-fired": skillFired,
    },
  },
];
