// @ts-nocheck
/**
 * Generated single-failing-check fixtures: conclusion x sibling x attempt x scope x queued.
 * Deterministic and small (96 cases); each is an ordinary Fixture for the no-op agent run.
 */
import type { Fixture } from "./harness.mts";
import { hashBody } from "../../src/state/seen-comments.mts";

export const CONCLUSIONS = [
  "FAILURE+excerpt",
  "FAILURE",
  "CANCELLED",
  "STARTUP_FAILURE",
  "ACTION_REQUIRED",
  "TIMED_OUT",
];

const RUN_ID = "900";
const EXCERPT = "Process completed with exit code 1.";

export interface CheckCase {
  conclusion: string;
  runningSibling: boolean;
  attempt: number;
  scope: "pr" | "merge_group";
  queued: boolean;
}

export function caseName(c: CheckCase): string {
  const sibling = c.runningSibling ? "running-sibling" : "run-completed";
  return `${c.conclusion}|${c.scope}|attempt-${c.attempt}|${sibling}|${c.queued ? "queued" : "not-queued"}`;
}

function failingCheck(c: CheckCase) {
  const startup = c.conclusion === "STARTUP_FAILURE";
  return {
    name: "CI / tests",
    status: "COMPLETED",
    conclusion: c.conclusion.split("+")[0],
    event: c.scope === "pr" ? "pull_request" : "merge_group",
    detailsUrl: `https://github.com/owner/repo/actions/runs/${RUN_ID}`,
    runId: RUN_ID,
    workflowName: "CI",
    ...(!startup && { runAttempt: c.attempt }),
    ...(c.scope === "merge_group" && { scope: "merge_group", commitOid: "queue-commit-1" }),
  };
}

function runningSibling(c: CheckCase) {
  const { conclusion: _c, ...rest } = failingCheck(c);
  return { ...rest, name: "CI / e2e", status: "IN_PROGRESS", conclusion: null };
}

function triaged(c: CheckCase) {
  return {
    ...failingCheck(c),
    category: "failing",
    jobName: "tests",
    failedStep: "Run tests",
    ...(c.conclusion === "FAILURE+excerpt" && { logExcerpt: EXCERPT }),
  };
}

const QUEUE_REMOVAL = {
  reason: "failed_checks",
  actor: "github-actions",
  createdAtUnix: 1715799000,
  beforeCommitOid: "queue-commit-1",
  beforeCommitParentOids: ["abc123"],
};

export function buildCheckFixture(c: CheckCase): Fixture {
  const startup = c.conclusion === "STARTUP_FAILURE" && c.scope === "pr";
  const sibling = c.runningSibling ? [runningSibling(c)] : [];
  const batchData: Record<string, unknown> = {
    checks: startup ? sibling : [...(c.scope === "pr" ? [failingCheck(c)] : []), ...sibling],
  };
  if (c.queued) {
    batchData.isInMergeQueue = true;
    batchData.mergeQueueEntry = {
      position: 1,
      state: "QUEUED",
      estimatedTimeToMerge: null,
      headCommitOid: "queue-commit-1",
    };
  }
  if (c.scope === "merge_group") {
    batchData.isMergeQueueEnabled = true;
    batchData.latestMergeQueueRemoval = QUEUE_REMOVAL;
    batchData.removedMergeQueueChecks = [{ ...triaged(c), source: "check_run" }];
  }
  return {
    description: caseName(c),
    args: ["--merge"],
    batchData,
    ...(c.scope === "pr" && !startup && { triagedChecks: [triaged(c)] }),
    ...(startup && {
      startupFailureChecks: [{ ...failingCheck(c), source: "startup_failure" }],
    }),
    readyDelayState: { isReady: false, shouldCancel: false, remainingSeconds: 600 },
    expectedExitCode: 12,
  };
}

const RUNNING = {
  name: "CI / e2e",
  status: "IN_PROGRESS",
  conclusion: null,
  event: "pull_request",
  detailsUrl: `https://github.com/owner/repo/actions/runs/${RUN_ID}`,
  runId: RUN_ID,
  runAttempt: 1,
  workflowName: "CI",
};
const READY_STATE = { isReady: false, shouldCancel: false, remainingSeconds: 600 };

/** A failing external status (no run id, e.g. a coverage provider) beside optional running CI. */
function externalCase(running: boolean, queued: boolean) {
  const external = {
    name: "codecov/project/rust",
    status: "COMPLETED",
    conclusion: "FAILURE",
    event: null,
    detailsUrl: "https://app.codecov.io/gh/owner/repo/pull/42",
    runId: null,
  };
  const fixture: Fixture = {
    args: ["--merge"],
    batchData: {
      checks: [external, ...(running ? [RUNNING] : [])],
      ...(queued && {
        isInMergeQueue: true,
        mergeQueueEntry: { position: 1, state: "QUEUED", estimatedTimeToMerge: null },
      }),
    },
    triagedChecks: [{ ...external, category: "failing" }],
    readyDelayState: READY_STATE,
    expectedExitCode: 12,
  };
  return {
    name: `external-status|${running ? "ci-running" : "ci-done"}|${queued ? "queued" : "not-queued"}`,
    fixture,
  };
}

/** Only work left: dismiss an already-surfaced stale bot CHANGES_REQUESTED review. */
function botReviewCase(running: boolean) {
  const body = "Blockers: missing input validation in src/payments.mts:42.";
  const fixture: Fixture = {
    batchData: {
      mergeStateStatus: "BLOCKED",
      reviewDecision: "CHANGES_REQUESTED",
      changesRequestedReviews: [{ id: "PRR_bot_stale", author: "claude", authorType: "Bot", body }],
      checks: running ? [RUNNING] : [],
    },
    seenMap: { PRR_bot_stale: { seenAt: 1715799000, bodyHash: hashBody(body) } },
    readyDelayState: READY_STATE,
    expectedExitCode: 12,
  };
  return { name: `bot-cr-dismiss|${running ? "ci-running" : "ci-done"}`, fixture };
}

export function generatedChecks(): Array<{ name: string; fixture: Fixture }> {
  const cases: CheckCase[] = [];
  for (const conclusion of CONCLUSIONS)
    for (const runningSibling of [false, true])
      for (const attempt of [1, 2])
        for (const scope of ["pr", "merge_group"] as const)
          for (const queued of [false, true])
            cases.push({ conclusion, runningSibling, attempt, scope, queued });
  return [
    ...cases.map((c) => ({ name: caseName(c), fixture: buildCheckFixture(c) })),
    ...[false, true].flatMap((r) => [false, true].map((q) => externalCase(r, q))),
    botReviewCase(false),
    botReviewCase(true),
  ];
}
