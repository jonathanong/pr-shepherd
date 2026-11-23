// CI and review scenarios for #752/#754 (a failure already shown, run still going)
// and #781 (a changes-requested review made on an older commit).

import { PR_URL, clockNow, fixtureText } from "../lib.mjs";
import { olderCommitReview, shownFailureIterate } from "./recent-ticks.mjs";
import { PR, REREAD } from "./world.mjs";

const NOW = clockNow(fixtureText("199-wait-in-progress-run-failure-shown")).now;

export const RECENT_CI_SCENARIOS = [
  {
    // Tick 1 shows the failure while a sibling job runs; tick 2 is a WAIT on it.
    slug: "67-wait-after-shown-failure",
    fixture: "200-triage-in-progress-run-failure-first-look",
    shepherd: { iterate: shownFailureIterate },
    tags: ["ci", "investigate", "wait"],
    failures: true,
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.")}

Workflow "CI", run id 900, on \`c0ffee1\`, is in progress with two jobs:
- \`tests\` (job id 9001): completed, conclusion failure. Its failed step "Run
  tests" ends with:
    Simulator launch timed out.
    ##[error]Process completed with exit code 1.
  This is the iOS simulator job. Neither changed file touches mobile code, and
  the same job passed on \`main\` an hour ago.
- \`e2e\` (job id 9002): in progress, started 3 minutes ago, usually about 10
  minutes.
The checks on \`c0ffee1\` report these two jobs as check runs \`tests\` (completed,
failure) and \`e2e\` (in progress), with no commit statuses, so the combined commit
status is pending with an empty list; the check run \`tests\` reports failure.
Run 900 cannot be rerun while it is in progress: \`gh run rerun 900\` and \`gh run
rerun 900 --failed\` print "run 900 cannot be rerun; This workflow is already
running" and exit 1. No other runs, no reviews, threads or comments. The current
time is ${NOW}.`,
    grader: `The agent works out why the failed job failed from the failed step's
excerpt it has seen (in any tool's output) or from the job's log or run page,
concludes that the simulator launch timeout is not caused by this PR's pagination
change, and makes no code change for it. An agent that works from an excerpt it
has already seen has investigated; it need not fetch the log again. It leaves run 900 alone while it is in progress and waits for it to
finish: it ends this pass either saying it will look at the PR again when run 900
completes (or at the next scheduled check), or saying it will rerun the status
tool that waits for the run to finish. It may add that a failure that remains
after the run ends is then rerun or reported. It runs no sleep, watch or poll
loop of its own.

${REREAD}

Failing responses do any of: change code or tests to fix the timeout, or loop on
fixes for it; push an empty commit; rerun or cancel run 900 or its failed job
while the run is in progress; write its own sleep, watch or poll loop; investigate
the same failure again and again; present the PR as ready or merge it; hand the
PR to the user.`,
  },
];

export const RECENT_REVIEW_SCENARIOS = [
  {
    // The review is on a1b2c3d; the next commit already adds the validation.
    slug: "68-changes-requested-older-commit",
    fixture: "178-triage-cr-review-commit",
    transform: olderCommitReview,
    tags: ["review", "changes-requested"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `PR #42 "Add charge endpoint" in owner/repo: open, not a draft, base \`main\`,
head \`feature\` at commit \`c0ffee1\`, author \`you\`. No merge queue. Changed
files: \`src/charge.ts\`, \`tests/charge.spec.ts\`.

Commits on the branch: \`a1b2c3d\` "Add charge endpoint", then \`c0ffee1\` "Validate
amount before charging". \`c0ffee1\` changes \`src/charge.ts\`: it adds at the top
of \`charge(amount)\`
  if (!Number.isFinite(amount) || amount <= 0) throw new RangeError("amount must be a positive number");
and adds a test \`rejects non-positive amounts\` to \`tests/charge.spec.ts\`.

Review id 3300 (node \`PRR_older_commit\`) by the bot \`claude\`, CHANGES_REQUESTED,
submitted on commit \`a1b2c3d\`: "Please validate the amount before charging." It
has no inline comments. It is the only review, and it is still not dismissed or
resolved. mergeStateStatus BLOCKED (changes requested). Check \`build\` passed on
\`c0ffee1\`. No threads or other comments.`,
    grader: `The review was made on \`a1b2c3d\`, and the later commit \`c0ffee1\` ("Validate
amount before charging") already adds the validation it asks for. Required: the
agent looks at the later commit (its message or diff, or the changed
\`src/charge.ts\`) before deciding on any change, finds that the request is
already addressed, makes no new code change for it, and answers the review: it
replies or comments that \`c0ffee1\` addresses it and dismisses or resolves the
review (or states those as its steps). It then moves on to getting the PR
mergeable.

Failing responses do any of: add the validation again, or plan any code change to
\`src/charge.ts\` for this review, without having looked at \`c0ffee1\`; ignore
the review and leave it unanswered; claim it is addressed without having looked
at the later commit; escalate or hand it to the user.`,
  },
];
