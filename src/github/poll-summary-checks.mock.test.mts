import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { failingSummaryCheckNames, summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import { isCurrentSummaryReady } from "./poll-summary-readiness.mts";
import type { RawCheckRollup, RawSummaryPr } from "./poll-summary-raw.mts";

type Context = RawCheckRollup["contexts"]["nodes"][number];
type CheckContext = Extract<Context, { __typename: "CheckRun" }>;

function check(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    __typename: "CheckRun",
    id: "check-success",
    name: "lint-links",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "https://github.com/acme/widgets/actions/runs/100",
    startedAt: "2026-10-04T07:54:28Z",
    completedAt: "2026-10-04T07:54:51Z",
    checkSuite: {
      workflowRun: {
        databaseId: 100,
        event: "pull_request",
        workflow: { databaseId: 77, name: "Lint Links" },
      },
    },
    ...overrides,
  };
}

function cancelled(): CheckContext {
  return check({
    id: "check-cancelled",
    conclusion: "CANCELLED",
    detailsUrl: "https://github.com/acme/widgets/actions/runs/200",
    startedAt: "2026-10-04T07:54:23Z",
    completedAt: "2026-10-04T07:54:25Z",
    checkSuite: {
      workflowRun: {
        databaseId: 200,
        event: "pull_request",
        workflow: { databaseId: 77, name: "Lint Links" },
      },
    },
  });
}

function rollup(nodes: Context[], incomplete = false): RawCheckRollup {
  return {
    contexts: {
      totalCount: nodes.length,
      pageInfo: { hasPreviousPage: incomplete },
      nodes,
    },
  };
}

function raw(head: RawCheckRollup | null, queue: RawCheckRollup | null = null): RawSummaryPr {
  const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };
  return {
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
    reviewDecision: "APPROVED",
    isInMergeQueue: queue !== null,
    mergeQueueEntry: queue
      ? { headCommit: { oid: "c".repeat(40), statusCheckRollup: queue } }
      : null,
    stack: null,
    stackEntry: null,
    comments: empty,
    reviews: empty,
    reviewThreads: empty,
    commits: { nodes: [{ commit: { oid: "a".repeat(40), statusCheckRollup: head } }] },
  };
}

beforeEach(() => {
  mockLoadConfig.mockReturnValue({
    ignoreChecks: [],
    checks: { ciTriggerEvents: ["pull_request"] },
    actions: { neverCancelRuns: [] },
  });
});

describe("compact check chronology", () => {
  it("normalizes timestamps when a lower-ID success started after a higher-ID cancellation", () => {
    const nodes = [cancelled(), check()];
    const snapshot = raw(rollup(nodes));
    const summary = summarizePollSummaryChecks(snapshot);
    expect(summary).toEqual({ superseded: 1, passing: 1 });
    expect(failingSummaryCheckNames(snapshot)).toEqual([]);
    expect(isCurrentSummaryReady(snapshot, summary, {})).toBe(true);
  });

  it.each([
    { startedAt: undefined },
    { completedAt: null },
    { startedAt: "invalid" },
    { completedAt: "invalid" },
    { startedAt: "2026-10-04T07:54:23Z" },
    { completedAt: "2026-10-04T07:54:25Z" },
  ])("keeps uncertain timestamps blocking: %o", (override) => {
    const snapshot = raw(rollup([cancelled(), check(override)]));
    const summary = summarizePollSummaryChecks(snapshot);
    expect(summary).toEqual({ failing: 1, passing: 1 });
    expect(failingSummaryCheckNames(snapshot)).toEqual(["lint-links"]);
    expect(isCurrentSummaryReady(snapshot, summary, {})).toBe(false);
  });

  it("keeps a genuinely later cancellation blocking", () => {
    const laterCancellation = cancelled();
    laterCancellation.startedAt = "2026-10-04T07:55:23Z";
    laterCancellation.completedAt = "2026-10-04T07:55:25Z";
    const snapshot = raw(rollup([laterCancellation, check()]));
    expect(summarizePollSummaryChecks(snapshot)).toEqual({ failing: 1, passing: 1 });
    expect(failingSummaryCheckNames(snapshot)).toEqual(["lint-links"]);
  });

  it("keeps pending replacements and real failures blocking", () => {
    for (const replacement of [
      check({ status: "IN_PROGRESS", conclusion: null, completedAt: null }),
      check({ conclusion: "FAILURE" }),
    ]) {
      const snapshot = raw(rollup([cancelled(), replacement]));
      const summary = summarizePollSummaryChecks(snapshot);
      expect(summary.failing).toBeGreaterThan(0);
      expect(summary.superseded).toBeUndefined();
      expect(isCurrentSummaryReady(snapshot, summary, {})).toBe(false);
    }
  });

  it.each([false, true])("does not match across commit rollups (reverse: %s)", (reverse) => {
    const cancellation = rollup([cancelled()]);
    const success = rollup([check()]);
    const snapshot = raw(reverse ? success : cancellation, reverse ? cancellation : success);
    expect(summarizePollSummaryChecks(snapshot)).toMatchObject({ failing: 1, passing: 1 });
    expect(failingSummaryCheckNames(snapshot)).toEqual(["lint-links"]);
  });

  it("keeps the older-run rule isolated between PR and queue commits", () => {
    const olderCancellation = check({ conclusion: "CANCELLED" });
    const newerSuccess = cancelled();
    newerSuccess.conclusion = "SUCCESS";
    const snapshot = raw(rollup([olderCancellation]), rollup([newerSuccess]));
    expect(summarizePollSummaryChecks(snapshot)).toEqual({ failing: 1, passing: 1 });
  });

  it("recognizes covered checks within a queue-only rollup", () => {
    const nodes = [cancelled(), check()].map((node) => ({
      ...node,
      checkSuite: {
        workflowRun: { ...node.checkSuite!.workflowRun!, event: "merge_group" },
      },
    }));
    const snapshot = raw(null, rollup(nodes));
    expect(summarizePollSummaryChecks(snapshot)).toEqual({ superseded: 1, passing: 1 });
    expect(failingSummaryCheckNames(snapshot)).toEqual([]);
  });

  it("never covers cancellation with a filtered push success", () => {
    const push = check({
      checkSuite: {
        workflowRun: {
          databaseId: 300,
          event: "push",
          workflow: { databaseId: 77, name: "Lint Links" },
        },
      },
    });
    const snapshot = raw(rollup([cancelled(), push]));
    expect(summarizePollSummaryChecks(snapshot)).toEqual({ failing: 1, filtered: 1 });
    expect(failingSummaryCheckNames(snapshot)).toEqual(["lint-links"]);
  });

  it("does not grant readiness from incomplete evidence", () => {
    const snapshot = raw(rollup([cancelled(), check()], true));
    const summary = summarizePollSummaryChecks(snapshot);
    expect(summary).toEqual({ superseded: 1, passing: 1, incomplete: true });
    expect(isCurrentSummaryReady(snapshot, summary, {})).toBe(false);
  });
});
