import { beforeEach, expect, it, vi } from "vitest";
import { testConfig } from "../../test-helpers/config/test-config.mts";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));
vi.mock("../state/seen-comments.mts", () => ({
  loadSeenMap: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("./check-annotations-batch.mts", () => ({
  fetchCheckRunAnnotationsBatch: vi.fn().mockResolvedValue({
    annotations: new Map([["skip-id", [{ id: "annotation-1" }]]]),
    failures: [],
  }),
}));

import { markReadyAnnotationProbeComplete } from "./poll-summary-annotation-probe.mts";
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
  mockLoadConfig.mockReturnValue(
    testConfig({
      "bot-usernames": [],
      checks: { ignore: ["ignored *"], "ci-trigger-events": ["pull_request"] },
    }),
  );
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
    mergeQueueEntry: {
      headCommit: { oid: "f".repeat(40), statusCheckRollup: rollup("queue tests", "FAILURE") },
    },
    stack: null,
    stackEntry: null,
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    commits: {
      nodes: [
        { commit: { oid: "e".repeat(40), statusCheckRollup: rollup("ignored lint", "FAILURE") } },
      ],
    },
  } as RawSummaryPr;

  const item = await summarizePollSummaryPr(
    raw,
    { owner: "acme", name: "widgets" },
    { merge: true },
  );
  expect(item).toMatchObject({
    action: "triage",
    reasons: ["failing-checks"],
    checks: { failing: 1, ignored: 1 },
  });
});

function readyPr(commit: object): RawSummaryPr {
  const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };
  return {
    number: 43,
    title: "Gadgets",
    url: "https://github.com/acme/widgets/pull/43",
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "gadgets",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    baseRefOid: "b".repeat(40),
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: false,
    stack: null,
    stackEntry: null,
    comments: empty,
    reviews: empty,
    reviewThreads: empty,
    commits: { nodes: [{ commit: { oid: "e".repeat(40), ...commit } }] },
  } as unknown as RawSummaryPr;
}

const repo = { owner: "acme", name: "widgets" };

it("routes a workflow that failed to start to the one-PR check instead of cancel", async () => {
  const raw = readyPr({
    statusCheckRollup: null,
    checkSuites: {
      pageInfo: { hasNextPage: false },
      nodes: [
        {
          conclusion: "STARTUP_FAILURE",
          workflowRun: { databaseId: 9, event: "pull_request", workflow: { name: "Deploy" } },
        },
      ],
    },
  });
  const item = await summarizePollSummaryPr(raw, repo, {});
  expect(item).toMatchObject({
    action: "triage",
    reasons: ["failing-checks"],
    checks: { failing: 1 },
    pollCommand: expect.any(String),
  });
});

it("routes unseen annotations on a skipped check to the one-PR check instead of cancel", async () => {
  const raw = readyPr({
    statusCheckRollup: {
      contexts: {
        totalCount: 1,
        pageInfo: { hasPreviousPage: false },
        nodes: [
          {
            __typename: "CheckRun",
            id: "skip-id",
            name: "optional",
            status: "COMPLETED",
            conclusion: "SKIPPED",
            annotations: { totalCount: 1 },
            checkSuite: { workflowRun: { event: "pull_request" } },
          },
        ],
      },
    },
  });
  markReadyAnnotationProbeComplete(raw);
  const item = await summarizePollSummaryPr(raw, repo, {});
  expect(item).toMatchObject({
    action: "triage",
    reasons: ["check-annotations"],
    checks: { skipped: 1, annotated: 1 },
    pollCommand: expect.any(String),
  });
});
