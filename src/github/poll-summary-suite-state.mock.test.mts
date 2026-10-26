import { beforeEach, expect, it, vi } from "vitest";
import { testConfig } from "../../test-helpers/config/test-config.mts";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));
vi.mock("../state/seen-comments.mts", () => ({
  loadSeenMap: vi.fn().mockResolvedValue(new Map()),
}));

import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import { classifiedSummaryChecks } from "./poll-summary-checks.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue(
    testConfig({ "bot-usernames": [], checks: { "ci-trigger-events": ["pull_request"] } }),
  );
});

const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };

function cleanPr(
  nodes: Array<Record<string, unknown>>,
  checkSuites?: unknown,
  overrides: Record<string, unknown> = {},
): RawSummaryPr {
  return {
    number: 7,
    title: "PR",
    url: "https://github.com/acme/widgets/pull/7",
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "feature",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    baseRefOid: "b".repeat(40),
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: false,
    mergeQueueEntry: null,
    stack: null,
    stackEntry: null,
    comments: empty,
    reviews: empty,
    reviewThreads: empty,
    commits: {
      nodes: [
        {
          commit: {
            oid: "c".repeat(40),
            statusCheckRollup: {
              contexts: { totalCount: nodes.length, pageInfo: { hasPreviousPage: false }, nodes },
            },
            ...(checkSuites !== undefined && { checkSuites }),
          },
        },
      ],
    },
    ...overrides,
  } as unknown as RawSummaryPr;
}

const repo = { owner: "acme", name: "widgets" };
const suite = (status: string, event: string | null = "pull_request") => ({
  nodes: [{ status, conclusion: null, workflowRun: event ? { event } : null }],
});
const checkRun = (suiteStatus: string | undefined, status = "IN_PROGRESS") => ({
  __typename: "CheckRun",
  name: "tests",
  status,
  conclusion: status === "COMPLETED" ? "SUCCESS" : null,
  checkSuite: {
    ...(suiteStatus && { status: suiteStatus }),
    workflowRun: { event: "pull_request" },
  },
});

it("waits for a CLEAN PR with no checks while an Actions suite is queued", async () => {
  const item = await summarizePollSummaryPr(cleanPr([], suite("QUEUED")), repo, {}, false);
  expect(item.action).toBe("wait");
  expect(item.reasons).toEqual(["pending-or-unknown"]);
  expect(item.checks?.actionsWorkflowInProgress).toBe(true);
});

it("waits for a clean draft with no checks while an Actions suite is running", async () => {
  const item = await summarizePollSummaryPr(
    cleanPr([], suite("IN_PROGRESS"), { isDraft: true }),
    repo,
    {},
    false,
  );
  expect(item.action).toBe("wait");
});

it.each([
  ["no suites at all", undefined],
  ["only a third-party suite", suite("QUEUED", null)],
  ["only completed suites", suite("COMPLETED")],
])("still reaches ready for a CLEAN PR with no checks and %s", async (_name, suites) => {
  const item = await summarizePollSummaryPr(cleanPr([], suites), repo, {}, false);
  expect(item.action).toBe("cancel");
  expect(item.reasons).toEqual(["appears-ready"]);
  expect(item.checks?.actionsWorkflowInProgress).toBeUndefined();
});

it("does not flag a running suite once a relevant check has reported", async () => {
  const item = await summarizePollSummaryPr(
    cleanPr([checkRun("COMPLETED", "COMPLETED")], suite("IN_PROGRESS")),
    repo,
    {},
    false,
  );
  expect(item.action).toBe("cancel");
  expect(item.checks?.actionsWorkflowInProgress).toBeUndefined();
});

it("routes a check stuck in progress inside a completed suite to triage", async () => {
  const pr = cleanPr([checkRun("COMPLETED")], suite("COMPLETED"));
  expect(classifiedSummaryChecks(pr)[0]).toMatchObject({
    category: "failing",
    status: "IN_PROGRESS",
    suiteStatus: "COMPLETED",
  });
  const item = await summarizePollSummaryPr(pr, repo, {}, false);
  expect(item.action).toBe("triage");
  expect(item.reasons).toEqual(["failing-checks"]);
  expect(item.checks).toMatchObject({ failing: 1 });
});

it("keeps a running or unknown suite's in-progress check pending", async () => {
  for (const status of ["IN_PROGRESS", undefined]) {
    const item = await summarizePollSummaryPr(cleanPr([checkRun(status)]), repo, {}, false);
    expect(item.action).toBe("wait");
    expect(item.checks?.inProgress).toBe(1);
  }
});
