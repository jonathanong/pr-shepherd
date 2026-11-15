// More CI scenarios: checks that never report, never start, or never run, and
// annotations instead of a log. `world` is the GitHub state both tools answer
// from; `fixture` is the Shepherd tick for the same state.

import { PR_URL } from "../lib.mjs";
import { PR, STEPS } from "./world.mjs";
import { neverReportsIterate, withDiagnoseSteps } from "./never-reports-ticks.mjs";
import { withWorkflowFile } from "./startup-failure-ticks.mjs";
import { deploymentIterate } from "./deployment-ticks.mjs";

const SEVEN = "`static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`";

/** Fixture 128 lists seven unreported checks on another repo; this world has one. */
const NEVER_REPORTS = (t) =>
  withDiagnoseSteps(t)
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
];
