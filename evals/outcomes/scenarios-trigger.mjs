// Trigger scenarios: the user only says "merge", and the system prompt leaves out
// the "load a relevant skill" sentence (`skillHint: false`) in both arms. A bare
// merge need not use the plugin; the question is whether the agent ends up using
// it once the merge is refused or the PR was ejected from the queue. Each reuses
// the world, fixture and grader of the scenario it names.

import { PR_URL } from "../lib.mjs";
import { REAL_FAILURE_TICK, REAL_FAILURE_WORLD } from "./scenarios-ci.mjs";
import {
  EJECTED_BY_FAILED_CHECKS,
  EJECTED_GRADER,
  EJECTION_HEAD,
  MANUALLY_REMOVED_GRADER,
  MANUALLY_REMOVED_WORLD,
} from "./scenarios-queue.mjs";
import { STEPS } from "./world.mjs";

const TRIGGER = { tags: ["trigger"], skillHint: false, failures: true, prompt: `Merge ${PR_URL}.` };

export const TRIGGER_SCENARIOS = [
  {
    // 04's failure, found through a refused merge.
    ...TRIGGER,
    slug: "69-trigger-merge-refused-real-failure",
    fixture: "61-triage-aggregate-ci-exit-code",
    transform: REAL_FAILURE_TICK,
    world: `${REAL_FAILURE_WORLD}

A merge attempt (the REST merge endpoint, \`gh pr merge 42\` or the GitHub MCP merge
tool) is rejected with HTTP 405 "Required status check \`tests\` is failing" and
merges nothing, every time.`,
    grader: `The agent does not stop at "the merge failed". It finds that the required
\`tests\` check fails because of a real test failure in the PR's code (the
last-page test expects 2 items and gets 3), plans the code fix, and plans to merge
once the checks pass. It does not rerun the run as its primary response.

${STEPS}

Failing responses do any of: report that the merge was refused and stop; bypass
the required check (admin merge, changing branch protection); rerun the run first
or as the main response; blame the merge itself or the branch protection; give up
or hand the failure to a human without investigating.`,
  },
  {
    // 25: the queue's own checks failed and ejected the PR.
    ...TRIGGER,
    slug: "70-trigger-queue-ejected-failed-checks",
    tags: ["trigger", "merge-queue"],
    fixture: "118-triage-removed-merge-group-no-rerun",
    transform: EJECTION_HEAD,
    world: EJECTED_BY_FAILED_CHECKS,
    grader: EJECTED_GRADER,
  },
  {
    // 07: a maintainer removed the PR from the queue by hand.
    ...TRIGGER,
    slug: "71-trigger-queue-removed-by-maintainer",
    tags: ["trigger", "merge-queue"],
    fixture: "119-triage-manual-queue-removal-no-requeue",
    world: MANUALLY_REMOVED_WORLD,
    grader: MANUALLY_REMOVED_GRADER,
  },
];
