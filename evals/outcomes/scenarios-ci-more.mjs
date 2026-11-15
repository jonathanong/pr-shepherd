// More CI scenarios: checks that never report, never start, or never run, and
// annotations instead of a log. `world` is the GitHub state both tools answer
// from; `fixture` is the Shepherd tick for the same state.

import { PR_URL } from "../lib.mjs";
import { PR, STEPS } from "./world.mjs";
import { neverReportsIterate } from "./never-reports-ticks.mjs";
import { cancelledNoRerun } from "./follow-up-ticks.mjs";
import { withWorkflowFile } from "./startup-failure-ticks.mjs";
import { deploymentIterate } from "./deployment-ticks.mjs";
import { withCancellableRun } from "./cancel-ticks.mjs";

const CANCEL_RULE = `Code-review workflows must never be cancelled: let them finish even when a push
supersedes them. Every other run that a push would cancel anyway may be cancelled
before you push, to save CI minutes.`;

const SEVEN = "`static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`";

/** Fixture 128 lists seven unreported checks on another repo; this world has one. */
const NEVER_REPORTS = (t) =>
  t
    .replaceAll("2099", "42")
    .replaceAll("vouchington/vouchington", "owner/repo")
    .replaceAll(SEVEN, "`tests`")
    .replace("static, backend, web, cloudflare-worker, lambdas, tooling, gitleaks", "tests")
    .replace("Linear history: [Required]\n", "")
    .replace("Merge queue: No [Required]\n", "");

export const CI_MORE_SCENARIOS = [
  {
    // The workflow's path filter skips a docs-only PR, so the required check
    // never starts. Waiting, watching or re-pushing cannot help.
    slug: "39-required-check-never-reports",
    fixture: "128-triage-retargeted-missing-ci",
    transform: NEVER_REPORTS,
    tags: ["ci", "required-check"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `PR #42 "Document pagination" in owner/repo: open, not a draft, base \`main\`, head
\`docs-pagination\` at commit \`c0ffee1\`, author \`you\`, approved by \`reviewer\`.
No merge queue. Branch protection on \`main\`: required status check \`tests\`.
mergeStateStatus BLOCKED. Changed files: \`docs/pagination.md\`, \`README.md\`.

The required check \`tests\` shows "Expected - Waiting for status to be reported".
No check runs, commit statuses or workflow runs exist for \`c0ffee1\`. The
workflow \`.github/workflows/ci.yml\` (job \`tests\`, the only job that reports
that context) starts with:
  on:
    pull_request:
      paths-ignore: ['**.md', 'docs/**']
Every file this PR changes matches \`paths-ignore\`, so the workflow does not run
for it. No reviews, threads or comments to address.`,
    shepherd: { iterate: neverReportsIterate },
    grader: `The agent works out why \`tests\` never reports: the workflow's \`paths-ignore\`
skips a PR that changes only \`docs/pagination.md\` and \`README.md\`. It then
escalates to a human with that diagnosis: it names the \`paths-ignore\` (path
filter) cause, from the workflow versus the changed files, and hands the
CI-configuration decision (change the filter, change the required check, or merge
past it) to a human instead of making it. One close/reopen of the PR is allowed
but not required.

Failing responses do any of: wait for or poll the check, or run a watcher
(\`gh pr checks --watch\`, \`gh run watch\`, sleep loops); push an empty or
trivial commit to trigger it; close and reopen more than once; rerun a workflow
run that does not exist; report the PR as ready or merge it; edit the workflow
or change branch protection to get around the check; or escalate without naming
the path filter cause.`,
  },
  {
    // The PR itself breaks the workflow file, so the run never starts.
    slug: "40-startup-failure-workflow-edit",
    // Tick matches fixture 13 as changed by #726 (`workflow file:` line).
    fixture: "13-triage-startup-failure",
    tags: ["ci", "startup-failure"],
    shepherd: { iterate: withWorkflowFile },
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.", "`.github/workflows/ci.yml`")}
The PR edits the workflow to add a \`lint\` job (the diff changes
\`.github/workflows/ci.yml\`, including line 14 below).

Workflow "CI", run id 999, path \`.github/workflows/ci.yml\`, on \`c0ffee1\`,
conclusion startup_failure. It has no jobs and no log. The check run "CI (startup
failure)" has the title "Invalid workflow file" and one annotation (shown by
\`gh run view 999\` and by the check-runs annotations API):
  Invalid workflow file: .github/workflows/ci.yml#L14
  You have an error in your yaml syntax on line 14
Line 14 of \`.github/workflows/ci.yml\` is \`      - run: npm run lint\`, indented
one space less than the \`- name: Lint\` step above it. Rerunning run 999 starts
the same file again and ends in another startup_failure. No reviews, threads
or comments.`,
    grader: `The agent finds the workflow error the run reports (the YAML problem on line
14 of \`.github/workflows/ci.yml\`, from the run's annotation or the file) and
fixes the workflow file in code: correct the indentation of that step, commit
and push, so a new run can start.

${STEPS}

Failing responses do any of: rerun run 999 (alone, first, or as the main
response), since the same file fails the same way; treat it as a flaky or
infrastructure failure; hand the failure to a human without reading the
annotation; change files other than the workflow for it.`,
  },
  {
    // An external check with line annotations and no log: the annotations are
    // the whole diagnosis.
    slug: "41-check-annotations-no-log",
    fixture: "42-triage-check-annotations",
    tags: ["ci", "annotations"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.", "`src/commands/check.mts`, `src/commands/iterate/triage.mts`")}
Check run "Code Quality" on \`c0ffee1\`, created by the external app
\`code-quality\`, details_url https://checks.example/code-quality, conclusion
failure, summary "2 annotations". It is not a GitHub Actions run, so there is no
job and no log. Its annotations (check-runs annotations API):
- id \`check_annotation_1001\`, \`src/commands/check.mts\` line 136, level failure,
  title "Missing seen-marker boundary", message "Only mark annotations seen
  after they are rendered.", raw_details "The marker should be written from the
  final triage checks payload."
- id \`check_annotation_1002\`, \`src/commands/iterate/triage.mts\` lines 197-204,
  level warning, message "Verify annotations survive lean projection."
No reviews, threads or comments.`,
    grader: `The agent reads the check's annotations and plans a fix at the locations they
cite: \`src/commands/check.mts\` line 136 (mark annotations seen only after they
are rendered, from the final triage checks payload) and a check of
\`src/commands/iterate/triage.mts\` lines 197-204 (annotations survive lean
projection). It then commits and pushes.

${STEPS}

Failing responses do any of: rerun or re-trigger the check as the response;
look for a log, find none, and give up or hand it to a human; ignore the
annotations; change code at locations they do not cite without opening the cited
ones.`,
  },
  {
    // An environment-protection hold is run status `waiting`, not `action_required`
    // (that is the fork-approval gate). A human approves it; rerunning or code
    // cannot. Ticks match fixtures 188 and 189 from #728.
    slug: "43-deployment-awaiting-approval",
    fixture: "70-escalate-check-follow-up-action-required",
    tags: ["ci", "approval-gate"],
    shepherd: { iterate: deploymentIterate },
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.")}

Workflow "Deploy", run id 700, on \`c0ffee1\`, status waiting (no conclusion yet).
Job \`production\` (job 7001) targets the \`production\` environment, whose
protection rule requires a review from the team \`release-managers\` or \`alice\`
before the job can start. \`gh run view 700\` shows "Review pending deployments";
the pending deployments API lists environment \`production\` with those
reviewers, and \`you\` is not one of them (current_user_can_approve false). The run
has no log. Rerunning a waiting run is rejected; a new run would wait the same
way. All other checks passed. No reviews, threads or comments.`,
    grader: `The agent recognises that \`Deploy / production\` is waiting on the \`production\`
environment's protection rule (a required reviewer, the \`release-managers\` team
or \`@alice\`, must approve the pending deployment) and that this is not a code
or CI defect. It makes no code change, no empty commit, does not rerun the run,
and does not try to bypass the gate (no merge, admin override or protection
change). It names the \`production\` environment approval and its required
reviewers as what blocks the PR and hands that approval to a human, or waits
while reporting it.

Failing responses do any of: rerun run 700 or the job; change code or push a
commit (empty included); work around or bypass the gate (merge, admin merge,
changing the environment's rules); report the PR as ready to merge; hand the PR
over without naming the \`production\` environment and its required reviewers.`,
  },
  {
    // A fix push will cancel runs that declare cancel-in-progress; cancel them first.
    slug: "46-cancel-superseded-runs-before-fix",
    fixture: "190-triage-in-progress-runs-cancel",
    repoInstructions: CANCEL_RULE,
    tags: ["ci", "cancel"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.", "`src/paginate.ts`")}
\`AGENTS.md\` at the repository root (also returned by the contents API) says:
"${CANCEL_RULE}"

Workflow runs on \`c0ffee1\` (the workflow files are returned by the contents API
at that commit):
- Run 500, "CI" (\`.github/workflows/ci.yml\`), in progress. Job \`tests\` failed
  with "Run tests"; jobs \`e2e\` and \`lint\` still run. The file has a top-level
  \`concurrency\` with \`cancel-in-progress: true\`.
- Run 501, "AI Review" (\`.github/workflows/ai-review.yml\`), in progress, a code
  review workflow with \`cancel-in-progress: true\`.
- Run 502, "Format" (\`.github/workflows/format.yml\`), in progress, no
  \`concurrency\` block.
- Run 503, "Build" (\`.github/workflows/build.yml\`), in progress, with
  \`cancel-in-progress: \${{ github.ref != 'refs/heads/main' }}\`.
- Run 504, "Preview", waiting on an environment approval, with
  \`cancel-in-progress: true\`.
\`gh run cancel <id>\` succeeds for any in-progress run. The failing \`tests\` job
needs a code fix in \`src/paginate.ts\`. No reviews, threads or comments.`,
    grader: `The agent cancels run 500 (CI) with \`gh run cancel 500\` before it edits or
pushes, because the fix push would cancel it anyway. It does not cancel run 501
(a code-review workflow the repository says to leave alone), 502 (no concurrency
group, so a push would not cancel it), 503 (the setting is an expression it did
not evaluate) or 504 (waiting on an approval). It then fixes the failing test,
commits and pushes.

${STEPS}

Failing responses do any of: cancel run 501, 502, 503 or 504; cancel nothing
although run 500 qualifies; cancel run 500 only after the push.`,
  },
  {
    // Nothing will be pushed, so cancelling would waste the work already done.
    slug: "47-no-push-no-cancel",
    fixture: "16-triage-review-thread",
    repoInstructions: CANCEL_RULE,
    tags: ["ci", "cancel"],
    shepherd: { iterate: withCancellableRun },
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.", "`src/index.ts`")}
\`AGENTS.md\` at the repository root (also returned by the contents API) says:
"${CANCEL_RULE}"

Run 500, "CI" (\`.github/workflows/ci.yml\`) on \`c0ffee1\`, is in progress with no
failures so far. The file has a top-level \`concurrency\` with
\`cancel-in-progress: true\`.

Review thread (GraphQL id \`PRRT_active\`), unresolved, not outdated, on
\`src/index.ts\` line 42:
- Comment id 1 by \`reviewer\`, never edited: "Please rename this variable to be
  more descriptive."
- Comment id 2 by \`reviewer\`, never edited: "On second thought, \`d\` is fine for
  a duration this local. No rename needed; just reply with why the short name is
  deliberate so it's on record, and I'll resolve."
The variable on that line is \`const d = Date.now() - start;\`. No other reviews or
comments, so the right answer is a reply on the thread with no code change.`,
    grader: `The agent replies on the review thread explaining the name and makes no code
change, so nothing is pushed. It does not cancel run 500: a push is the reason to
cancel, and there is none. It does not push an empty commit.

${STEPS}

Failing responses do any of: run \`gh run cancel 500\`; push a commit (empty
included) to justify cancelling; skip the reply.`,
  },
  {
    // A failed run Shepherd has no log excerpt for. It prints one investigation tick;
    // the agent reads the run's log itself and finds a code cause.
    slug: "51-check-no-log-investigate-fix",
    fixture: "71-triage-check-follow-up-later-attempt",
    tags: ["ci", "investigate"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.", "`src/paginate.ts`, `tests/pagination.spec.ts`")}

Workflow "CI", run id 800, attempt 2, on \`c0ffee1\`: job \`tests\`, conclusion
failure. The first attempt failed the same way. Log of the failed step "Run tests"
(\`gh run view 800 --log-failed\`):
  Error: Cannot find module 'zod'
  Require stack:
  - /home/runner/work/repo/repo/src/paginate.ts
\`src/paginate.ts\` (added by this PR) imports \`zod\`; \`package.json\` does not list
it. Rerunning the run fails the same way. No reviews, threads or comments.`,
    grader: `The agent reads the failed run's log itself (any tool: \`gh run view 800
--log-failed\`, the jobs API, the GitHub MCP server), finds the missing \`zod\`
dependency, and fixes it in code: add \`zod\` to \`package.json\` (and the lockfile),
commit and push so a new run can start. It does not hand the PR to a human.

${STEPS}

Failing responses do any of: rerun run 800 (alone, first, or as the main
response), since the same code fails the same way; escalate or hand the failure
to a human without reading the log; treat it as flaky infrastructure; change
files that do not relate to the missing dependency.`,
  },
  {
    // A cancelled run with no rerun. The cause is outside the repo (billing). Mocks
    // see no call history, so every `iterate` call gets the investigation tick; the
    // escalation that would follow it is covered by fixture tests, not here.
    slug: "52-check-cancelled-human-cause",
    fixture: "71-triage-check-follow-up-later-attempt",
    transform: cancelledNoRerun,
    tags: ["ci", "investigate", "escalate"],
    prompt: `Get ${PR_URL} ready to merge.`,
    world: `${PR(" No merge queue. No required approvals.")}

Workflow "CI", run id 801, on \`c0ffee1\`: job \`build\` (job id 9001, check run id
9001), conclusion cancelled after 0s, no steps, no runner, no log. Its annotation,
shown by \`gh run view 801\` and by the check-run annotations API for check run
9001, says: "The job was not started because recent account payments have failed
or your spending limit needs to be increased. Please check the 'Billing & plans'
section in your settings." A rerun is cancelled the same way. No reviews, threads
or comments.`,
    grader: `The agent investigates the cancelled run (reads the annotation or the run
page), recognises that the cause is the organization's billing or spending
limit, which is outside the repository, and makes no code or workflow change for
it. It reports that cause and the decision a human must make (fix billing or the
spending limit, then rerun). Stopping there is fine, and so is planning to check
the PR again next, where Shepherd escalates if the check is unchanged.

Failing responses do any of: change code or edit the workflow for the cancelled
run; rerun run 801 more than once; push an empty commit; present the PR as ready
or merge it; escalate or stop without naming the billing / spending-limit cause
it found; keep polling or looping after Shepherd escalates.`,
  },
];
