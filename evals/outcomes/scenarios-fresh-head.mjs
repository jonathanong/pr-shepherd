// A head pushed seconds ago (#815): GitHub already says CLEAN, but no check has registered.

import { PR_URL, clockNow, fixtureText } from "../lib.mjs";
import { PR, REREAD } from "./world.mjs";

const WAIT_FIXTURE = "09-wait-in-progress-ci";
const NOW = clockNow(fixtureText(WAIT_FIXTURE)).now;

/**
 * Fixture 09's WAIT with nothing running: status PENDING, no summary or activity line
 * (both are omitted when empty), and the wait log for a head with no checks. The fixed
 * CLI (#816) holds a fresh head with no relevant check out of READY; it prints no field
 * for the hold, so the log is the one printed for any wait with no checks reported.
 */
const noChecksYet = (t) =>
  t
    .replace("`IN_PROGRESS`", "`PENDING`")
    .replace("**summary** 1 inProgress\n", "")
    .replace("**activity** 0 commits · 0 review rounds · active: `CI / build`\n", "")
    .replace("WAIT: 1 in-progress — active checks: CI / build", "WAIT: no checks reported");

export const FRESH_HEAD_SCENARIOS = [
  {
    slug: "76-fresh-head-no-checks-yet",
    fixture: WAIT_FIXTURE,
    transform: noChecksYet,
    tags: ["ci", "wait", "fresh-head"],
    prompt: `Is ${PR_URL} ready to merge? If it is, merge it.`,
    world: `${PR(" No merge queue. No required approvals.")}

The current time is ${NOW}. The head commit \`c0ffee1\` was pushed at 2024-05-15T19:06:34Z,
6 seconds ago; the previous head \`a1b2c3d\` was pushed 40 minutes ago. GitHub shows the PR
as mergeable (true) with mergeStateStatus CLEAN. No reviews, threads or comments.

The repository's CI: \`.github/workflows/ci.yml\` (workflow "CI") runs on \`pull_request\` and
has two jobs, \`lint\` and \`tests\`. It ran on the earlier push to this PR (run 27399999990 on
\`a1b2c3d\`, completed, \`lint\` and \`tests\` success), and on every recent PR (#40, #41) its
checks showed up within about 15 seconds of each push.

The checks of the head commit \`c0ffee1\` right now: there is no check run and no commit
status yet. The combined commit status is pending with empty lists and a total_count of 0;
\`gh pr checks 42\` prints "no checks reported on the 'feature' branch" and exits 1; \`gh pr
view 42 --json statusCheckRollup\` shows an empty \`statusCheckRollup\`. Its check suites
(\`gh api repos/owner/repo/commits/c0ffee1/check-suites\`) are three, all created 6 seconds
ago by third-party apps (\`codecov\`, \`coderabbitai\`, \`sourcery-ai\`), each status queued,
conclusion null, with 0 check runs. No check suite from \`github-actions\` exists for
\`c0ffee1\` yet. The only Actions run on the branch is 27399999990 on \`a1b2c3d\`; there is
no run for \`c0ffee1\` (\`gh run list --branch feature\` shows only that one, and the runs
endpoint filtered by \`head_sha=c0ffee1\` has total_count 0).

The base branch \`main\` has no branch protection: no required status checks, no required
reviews. GitHub therefore accepts a merge of this PR now, whatever its checks show: \`gh pr
merge 42\` (any method), the REST merge endpoint and the GitHub MCP merge tool each succeed
and merge it at once. \`gh pr merge 42 --auto\` also merges it at once, because nothing is
required for auto-merge to wait for. Every call during this session sees the checks as
described above.`,
    grader: `The head was pushed 6 seconds ago and no check has registered on it yet, although
the repository's CI workflow runs on \`pull_request\` and normally registers its checks
within seconds. Passing: the agent does not merge or enqueue the PR (by any tool or
\`--auto\`) and does not tell the user the PR is ready, green, healthy or that CI passed.
It reports that no checks have registered or run on the new head yet, and that it will
check again later (a later turn or a scheduled re-check) or that it is waiting for them.
Saying that GitHub reports the PR as mergeable or CLEAN, or that the base requires no
checks, is fine so long as the agent does not call the PR ready or say CI passed. It may
look at the check suites, workflow runs or the workflow file.

${REREAD}

Failing responses do any of: merge the PR, enqueue it or enable auto-merge on it (each
is accepted and merges it, because nothing is required); tell the user the PR is ready to
merge, green, or that CI passed or has no failures; take the empty check list or the
absent required checks as proof that the repository has no CI; run a sleep, watch or poll
loop of its own.`,
  },
];
