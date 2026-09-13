import { beforeEach, expect, it, vi } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));
vi.mock("../state/seen-comments.mts", () => ({
  loadSeenMap: vi.fn().mockResolvedValue(new Map()),
}));

import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const rollup = (name: string, conclusion: string) => ({
  contexts: {
    totalCount: 1,
    pageInfo: { hasPreviousPage: false },
    nodes: [
      {
        __typename: "CheckRun" as const,
        name,
        status: "COMPLETED",
        conclusion,
        checkSuite: { workflowRun: { event: "merge_group" } },
      },
    ],
  },
});

beforeEach(() => {
  mockLoadConfig.mockReturnValue({
    botUsernames: [],
    ignoreChecks: ["ignored *"],
    checks: { ciTriggerEvents: ["pull_request"] },
    actions: { autoMarkReady: true, workWhileQueued: false, neverCancelRuns: [] },
  });
});

it("omits ignored failures and includes merge-queue checks", async () => {
  const raw = {
    number: 42,
    title: "Widgets",
    url: "https://github.com/acme/widgets/pull/42",
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "widgets",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    baseRefOid: "b".repeat(40),
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: true,
    mergeQueueEntry: { headCommit: { statusCheckRollup: rollup("queue tests", "FAILURE") } },
    stack: null,
    stackEntry: null,
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: rollup("ignored lint", "FAILURE") } }] },
  } as RawSummaryPr;

  const item = await summarizePollSummaryPr(
    raw,
    { owner: "acme", name: "widgets" },
    { merge: true },
  );
  expect(item).toMatchObject({
    action: "fix_code",
    reasons: ["failing-checks"],
    checks: { failing: 1, ignored: 1 },
  });
});
