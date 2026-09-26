import { beforeEach, expect, it, vi } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));
vi.mock("../state/seen-comments.mts", () => ({
  loadSeenMap: vi.fn().mockResolvedValue(new Map()),
}));

import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

beforeEach(() => {
  mockLoadConfig.mockReturnValue({
    cliCommand: ["pr-shepherd"],
    botUsernames: [],
    ignoreChecks: [],
    checks: { ciTriggerEvents: ["pull_request"] },
    actions: { autoMarkReady: true, workWhileQueued: false, neverCancelRuns: [] },
  });
});

function blockedLayer(nodes: Array<Record<string, unknown>>, checkSuites?: unknown): RawSummaryPr {
  return {
    number: 622,
    title: "Copyright sweep",
    url: "https://github.com/acme/widgets/pull/622",
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "feature",
    headRefOid: "a".repeat(40),
    baseRefName: "feature-parent",
    baseRefOid: "b".repeat(40),
    mergeable: "MERGEABLE",
    mergeStateStatus: "BLOCKED",
    reviewDecision: null,
    isInMergeQueue: false,
    mergeQueueEntry: null,
    stack: { number: 623, size: 2, baseRefName: "main" },
    stackEntry: { position: 2 },
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    commits: {
      nodes: [
        {
          commit: {
            oid: "c".repeat(40),
            statusCheckRollup: {
              contexts: {
                totalCount: nodes.length,
                pageInfo: { hasPreviousPage: false },
                nodes,
              },
            },
            ...(checkSuites !== undefined && { checkSuites }),
          },
        },
      ],
    },
  } as unknown as RawSummaryPr;
}

const passed = (name: string) => ({
  __typename: "CheckRun" as const,
  name,
  status: "COMPLETED",
  conclusion: "SUCCESS",
  checkSuite: { workflowRun: { event: "pull_request" } },
});

const trunk = ["tests", "build", "gitleaks"];

it("routes an upper layer with unreported trunk checks to fix_code", async () => {
  const item = await summarizePollSummaryPr(
    blockedLayer(
      [passed("CodeRabbit"), passed("gitleaks"), passed("Label PRs"), passed("Lint Links")],
      { nodes: [{ status: "QUEUED", conclusion: null, workflowRun: null }] },
    ),
    { owner: "acme", name: "widgets" },
    {},
    false,
    trunk,
  );
  expect(item.action).toBe("fix_code");
  expect(item.reasons).toEqual(["unreported-required-checks"]);
  expect(item.checks?.unreportedRequired).toEqual(["tests", "build"]);
});

it("waits while a sibling check is still running", async () => {
  const item = await summarizePollSummaryPr(
    blockedLayer([
      passed("gitleaks"),
      {
        __typename: "CheckRun",
        name: "lint",
        status: "IN_PROGRESS",
        conclusion: null,
        checkSuite: { workflowRun: { event: "pull_request" } },
      },
    ]),
    { owner: "acme", name: "widgets" },
    {},
    false,
    trunk,
  );
  expect(item.action).toBe("wait");
  expect(item.reasons).toEqual(["pending-or-unknown"]);
  expect(item.checks?.unreportedRequired).toEqual(["tests", "build"]);
});

it("does not treat a third-party queued suite as running CI", async () => {
  const item = await summarizePollSummaryPr(
    blockedLayer([passed("gitleaks")], {
      nodes: [{ status: "QUEUED", conclusion: null, workflowRun: null }],
    }),
    { owner: "acme", name: "widgets" },
    {},
    false,
    trunk,
  );
  expect(item.action).toBe("fix_code");
  expect(item.checks?.actionsWorkflowInProgress).toBeUndefined();
});

it("waits while a relevant Actions suite has not completed", async () => {
  const item = await summarizePollSummaryPr(
    blockedLayer([passed("gitleaks")], {
      nodes: [{ status: "IN_PROGRESS", conclusion: null, workflowRun: { event: "pull_request" } }],
    }),
    { owner: "acme", name: "widgets" },
    {},
    false,
    trunk,
  );
  expect(item.action).toBe("wait");
  expect(item.checks?.actionsWorkflowInProgress).toBe(true);
});

it("leaves reported required checks on the ordinary blocked wait", async () => {
  const item = await summarizePollSummaryPr(
    blockedLayer([passed("tests"), passed("build"), passed("gitleaks")]),
    { owner: "acme", name: "widgets" },
    {},
    false,
    trunk,
  );
  expect(item.action).toBe("wait");
  expect(item.reasons).toEqual(["pending-or-unknown"]);
  expect(item.checks?.unreportedRequired).toBeUndefined();
});
