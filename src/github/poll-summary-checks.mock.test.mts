import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

function config() {
  return {
    ignoreChecks: [],
    checks: { ciTriggerEvents: ["pull_request", "pull_request_target"] },
    actions: { neverCancelRuns: [] },
  };
}

beforeEach(() => {
  mockLoadConfig.mockReturnValue(config());
});

function rawPr(
  nodes: RawSummaryPr["commits"]["nodes"][0]["commit"]["statusCheckRollup"],
): RawSummaryPr {
  return {
    commits: { nodes: [{ commit: { statusCheckRollup: nodes } }] },
    mergeQueueEntry: null,
  } as RawSummaryPr;
}

describe("summarizePollSummaryChecks — built-in ignores", () => {
  it("ignores a CodSpeed CheckRun by name", () => {
    const summary = summarizePollSummaryChecks(
      rawPr({
        contexts: {
          totalCount: 1,
          pageInfo: { hasPreviousPage: false },
          nodes: [
            {
              __typename: "CheckRun",
              name: "CodSpeed Performance Analysis",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://app.codspeed.io/owner/repo",
              checkSuite: { workflowRun: { event: "pull_request" } },
            },
          ],
        },
      }),
    );
    expect(summary).toMatchObject({ ignored: 1 });
    expect(summary.failing).toBeUndefined();
  });

  it("ignores a Codecov CheckRun whose summary first line is the missing-base-report message", () => {
    const summary = summarizePollSummaryChecks(
      rawPr({
        contexts: {
          totalCount: 1,
          pageInfo: { hasPreviousPage: false },
          nodes: [
            {
              __typename: "CheckRun",
              name: "codecov/project/javascript",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://app.codecov.io/gh/owner/repo/pull/1",
              title: null,
              summary: "No coverage information found on base report\n\n[View on Codecov]",
              checkSuite: null,
            },
          ],
        },
      }),
    );
    expect(summary).toMatchObject({ ignored: 1 });
  });

  it("ignores a Codecov CheckRun whose title is the missing-base-report message", () => {
    const summary = summarizePollSummaryChecks(
      rawPr({
        contexts: {
          totalCount: 1,
          pageInfo: { hasPreviousPage: false },
          nodes: [
            {
              __typename: "CheckRun",
              name: "codecov/project/rust",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://app.codecov.io/gh/owner/repo/pull/1",
              title: "No coverage information found on base report",
              checkSuite: null,
            },
          ],
        },
      }),
    );
    expect(summary).toMatchObject({ ignored: 1 });
  });

  it("ignores a Codecov StatusContext whose description is the missing-base-report message", () => {
    const summary = summarizePollSummaryChecks(
      rawPr({
        contexts: {
          totalCount: 1,
          pageInfo: { hasPreviousPage: false },
          nodes: [
            {
              __typename: "StatusContext",
              context: "codecov/project",
              state: "FAILURE",
              description: "No coverage information found on base report",
              targetUrl: "https://app.codecov.io/gh/owner/repo/pull/1",
            },
          ],
        },
      }),
    );
    expect(summary).toMatchObject({ ignored: 1 });
  });

  it("keeps a Codecov coverage-target failure", () => {
    const summary = summarizePollSummaryChecks(
      rawPr({
        contexts: {
          totalCount: 1,
          pageInfo: { hasPreviousPage: false },
          nodes: [
            {
              __typename: "StatusContext",
              context: "codecov/patch",
              state: "FAILURE",
              description: "67.68% of diff hit (target 85.00%)",
              targetUrl: "https://app.codecov.io/a/b",
            },
          ],
        },
      }),
    );
    expect(summary).toMatchObject({ failing: 1 });
    expect(summary.ignored).toBeUndefined();
  });
});
