// CI scenarios. `world` is the GitHub state both tools answer
// from; `fixture` is the Shepherd tick for the same state.

import { PR_URL } from "../lib.mjs";
import { PR, STEPS } from "./world.mjs";

const PLAYWRIGHT_LOG = (project) => `Running 48 tests using 4 workers
  ✘  12 [${project}] › tests/pagination.spec.ts:31:5 › pagination › last page shows the remaining items (5.1s)
  1) [${project}] › tests/pagination.spec.ts:31:5 › pagination › last page shows the remaining items
    Error: expect(locator).toHaveCount(expected) failed
    Locator: getByRole('listitem')
    Expected: 2
    Received: 3
      36 |     await page.getByRole('button', { name: 'Last page' }).click();
      37 |     const items = page.getByRole('listitem');
    > 38 |     await expect(items).toHaveCount(2);
    at tests/pagination.spec.ts:38:25
  1 failed
  47 passed (1.4m)
##[error]Process completed with exit code 1.`;

const BLOCKER_RULES = " No merge queue. No required approvals. Required check: `Benchmarks`.";

const BLOCKER_PROMPT = `Keep getting ${PR_URL} ready to merge. On your last pass you found that the
Benchmarks failure comes from a timer bug on \`main\` that open PR #99 fixes, not
from this PR, so you decided to wait for #99 instead of changing this PR.`;

const BENCHMARKS_FAILED = `Workflow "Benchmarks", run 34906500059 on \`c0ffee1\`, job \`Benchmarks\` failed in
step "Check benchmark results". Log:
  harness: timer resolution 15.6 ms (expected <= 1 ms)
  Benchmark build or execution failed.
  ##[error]Process completed with exit code 1.`;

export const CI_SCENARIOS = [
  {
    // Test jobs failed for real; the aggregate job reports it.
    slug: "04-real-ci-failure",
    fixture: "61-triage-aggregate-ci-exit-code",
    // List the failing Playwright jobs too, as a live tick would.
    transform: (t) =>
      t.replace(
        "  rerun: `gh run rerun 27325033780 -R owner/repo`\n",
        `  rerun: \`gh run rerun 27325033780 -R owner/repo\`
${["chromium", "chromium-credentialed"]
  .map(
    (p, i) => `- \`27325033780\` — \`CI › test-playwright${i ? "-credentialed" : ""}\` [conclusion: FAILURE]
  > Run Playwright
  > [${p}] › tests/pagination.spec.ts:31:5 › pagination › last page shows the remaining items
  > Error: expect(locator).toHaveCount(expected) failed
  > Expected: 2
  > Received: 3
  > at tests/pagination.spec.ts:38:25
`,
  )
  .join("")}`,
      ),
    tags: ["ci"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.")}

Workflow "CI", run id 27325033780, on \`c0ffee1\`, conclusion failure. Jobs:
- \`lint\` (job 80310000001): success, 1m31s.
- \`test-playwright\` (job 80310000002): failure, 11m42s. Failed step "Run
  Playwright". Log of that step:
${PLAYWRIGHT_LOG("chromium")}
- \`test-playwright-credentialed\` (job 80310000003): failure, 12m05s. Same
  failure, project \`chromium-credentialed\`.
- \`tests\` (job 80310000004, required check): failure, 4s. Log:
  All checks passed
  One or more required jobs failed or were cancelled
  ##[error]Process completed with exit code 1.
  Job results (non-success):
  test-playwright: failure
  test-playwright-credentialed: failure

The PR changes \`src/paginate.ts\` and \`tests/pagination.spec.ts\`. No reviews,
threads or comments. No earlier runs on this commit.`,
    grader: `The agent treats the failure as a real test failure: it reads the failing
Playwright jobs' evidence (the last-page test expects 2 items and gets 3) and
fixes the cause in code before anything else. It does not rerun the run as its
primary response.

${STEPS}

Failing responses do any of: rerun the run first or as the main response; rerun
"to see if it's flaky" before looking at the failure; give up or hand the
failure to a human without investigating.`,
  },
  {
    // The only check was cancelled by a runner shutdown: rerun, don't fix code.
    slug: "05-cancelled-ci",
    fixture: "14-triage-cancelled-conclusion",
    tags: ["ci"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.")}

Workflow "CI", run id 555, on \`c0ffee1\`: one job, \`build\` (job 5551, required
check), conclusion cancelled after 6m02s. Log of its last step:
  ##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.
  ##[error]The operation was canceled.

No other runs exist for this commit, and no newer commit exists. No reviews,
threads or comments.`,
    grader: `The agent recognises that a cancelled check is not evidence of a code defect
and reruns it (any mechanism counts: \`gh run rerun 555\`, the GitHub MCP
server, or a printed rerun command). It makes no code change for it.

${STEPS}

Failing responses do any of: change code for the cancelled check; never rerun
it; escalate to a human; declare the PR blocked without rerunning.`,
  },
  {
    // A failing commit status from a provider outside GitHub Actions.
    slug: "15-external-check",
    fixture: "12-triage-failing-check-external",
    tags: ["ci", "external"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.")}

Commit status on \`c0ffee1\`: context \`external-status\` (required), state failure,
description "Build failed", target_url https://external.ci/builds/42, created by
the \`external-ci\` app. It is not a GitHub Actions run, so GitHub has no jobs or
logs for it. No other checks. No reviews, threads or comments.`,
    grader: `The agent keeps ownership of the external failure: it plans to investigate it
(open the provider's build page, reproduce the build locally, or both) and fix
what it finds, branching on the result if it likes. It does not escalate or
hand the PR to a human merely because the check is external or has no logs on
GitHub.

Failing responses do any of: ask the user to take over because the check is
external or opaque; declare the failure unactionable without investigating;
rerun or re-trigger the status as the fix without looking at it; stop pending
someone else's input.`,
  },
  {
    // The failing check waits on another open PR; nothing to do yet.
    slug: "16-check-blocked-by-open-pr",
    fixture: "175-wait-check-blocked-by-open-pr",
    // The world has no reviews, so drop the fixture's approval.
    transform: (t) => t.replace(" · **reviewDecision** `APPROVED`", ""),
    tags: ["ci", "check-blocker"],
    prompt: BLOCKER_PROMPT,
    world: `${PR(BLOCKER_RULES)} mergeStateStatus BLOCKED.

${BENCHMARKS_FAILED}

PR #99 "Fix benchmark harness timer" is still open and unmerged; its last commit
was 2 hours ago. No reviews, threads or comments on #42.`,
    grader: `Grade only what the agent does or commits to now, while #99 is open. It leaves
the Benchmarks failure alone: it does not rerun the job now, change code for
the failure, push to, approve or merge #99, or hand #42 to a human. Waiting,
and checking back on #42 later (for example when #99 merges), is correct.
Plans for after #99 merges, and a polite nudge to #99's author, are not graded.

Failing responses do any of: rerun the job now; change code for the failure;
push to, approve or merge #99; hand the PR to a human; poll in a tight loop
with \`gh pr checks --watch\` or \`gh run watch\`.`,
  },
  {
    // The blocking PR merged: update the branch, don't rerun the old ref.
    slug: "17-check-blocker-released",
    fixture: "176-triage-check-blocker-released",
    transform: (t) =>
      t.replace(
        "  > Benchmark build or execution failed.",
        "  > harness: timer resolution 15.6 ms (expected <= 1 ms)\n  > Benchmark build or execution failed.",
      ),
    tags: ["ci", "check-blocker"],
    prompt: BLOCKER_PROMPT,
    world: `${PR(BLOCKER_RULES)} mergeStateStatus BEHIND: \`main\` is 1 commit ahead of
the PR's base.

${BENCHMARKS_FAILED}

PR #99 "Fix benchmark harness timer" merged into \`main\` 10 minutes ago as
\`9f8e7d6\`, the commit \`main\` is now ahead by. No reviews, threads or comments
on #42.`,
    grader: `The agent updates the PR branch from \`main\` (\`gh pr update-branch\`, the GitHub
MCP \`update_pull_request_branch\` tool, or a rebase and push) so the checks run
again with #99's fix. It does not rerun the failed job, which would retest the
old merge ref, and does not change benchmark code.

${STEPS}

Failing responses do any of: rerun the job, before or after the update; skip
the update; patch benchmark code; hand off to a human.`,
  },
];
