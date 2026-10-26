import { beforeEach, describe, expect, it, vi } from "vitest";
import { testConfig } from "../../test-helpers/config/test-config.mts";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { failingSummaryCheckNames, summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import { isCurrentSummaryReady } from "./poll-summary-readiness.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };
const passing = {
  __typename: "CheckRun" as const,
  id: "check-success",
  name: "lint-links",
  status: "COMPLETED",
  conclusion: "SUCCESS",
  checkSuite: { workflowRun: { databaseId: 100, event: "pull_request" } },
};
const rollup = (nodes: Array<typeof passing>) => ({
  contexts: { totalCount: nodes.length, pageInfo: { hasPreviousPage: false }, nodes },
});

const startup = (databaseId: number, name = "Deploy") => ({
  conclusion: "STARTUP_FAILURE",
  workflowRun: {
    databaseId,
    event: "pull_request",
    url: `https://github.com/acme/widgets/actions/runs/${databaseId}`,
    workflow: { name },
  },
});

type Suite = ReturnType<typeof startup> | { conclusion: null; workflowRun: null };

function raw(
  head: ReturnType<typeof rollup> | null,
  suites: Suite[],
  hasNextPage = false,
  queue: ReturnType<typeof rollup> | null = null,
): RawSummaryPr {
  return {
    number: 42,
    state: "OPEN",
    isDraft: false,
    headRefOid: "a".repeat(40),
    baseRefOid: "b".repeat(40),
    baseRefName: "main",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    isInMergeQueue: false,
    mergeQueueEntry: queue
      ? { headCommit: { oid: "c".repeat(40), statusCheckRollup: queue } }
      : null,
    comments: empty,
    reviews: empty,
    reviewThreads: empty,
    commits: {
      nodes: [
        {
          commit: {
            oid: "a".repeat(40),
            statusCheckRollup: head,
            checkSuites: { pageInfo: { hasNextPage }, nodes: suites },
          },
        },
      ],
    },
  } as unknown as RawSummaryPr;
}

beforeEach(() => {
  mockLoadConfig.mockReturnValue(testConfig({ checks: { "ci-trigger-events": ["pull_request"] } }));
});

describe("startup-failure workflow runs and annotation readiness", () => {
  it("counts a workflow that never started as a failing check, even with no check runs", () => {
    const snapshot = raw(null, [startup(9)]);
    expect(summarizePollSummaryChecks(snapshot)).toEqual({ failing: 1 });
    expect(failingSummaryCheckNames(snapshot)).toEqual(["Deploy"]);
  });

  it("replaces a check run of the same workflow run instead of double counting", () => {
    const snapshot = raw(rollup([passing]), [startup(100, "Lint Links")]);
    expect(summarizePollSummaryChecks(snapshot)).toEqual({ failing: 1 });
  });

  it("ignores suites that did not fail to start and does not touch the queue commit", () => {
    const snapshot = raw(
      rollup([passing]),
      [{ conclusion: null, workflowRun: null }],
      false,
      rollup([passing]),
    );
    expect(summarizePollSummaryChecks(snapshot)).toEqual({ passing: 2 });
  });

  it("does not grant readiness from a truncated suite list", () => {
    const snapshot = raw(rollup([passing]), [], true);
    const summary = summarizePollSummaryChecks(snapshot);
    expect(summary).toEqual({ passing: 1, incomplete: true });
    expect(isCurrentSummaryReady(snapshot, summary, {})).toBe(false);
  });

  it("does not grant readiness while a check holds unseen annotations", () => {
    const snapshot = raw(rollup([passing]), []);
    expect(isCurrentSummaryReady(snapshot, { passing: 1 }, {})).toBe(true);
    expect(isCurrentSummaryReady(snapshot, { passing: 1, annotated: 1 }, {})).toBe(false);
  });
});
