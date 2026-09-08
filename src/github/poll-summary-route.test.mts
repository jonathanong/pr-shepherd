import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import type { PollSummaryChecks, PollSummaryReview } from "../types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { normalizePollSummaryState, routePollSummary } from "./poll-summary-route.mts";

function raw(overrides: Record<string, unknown> = {}): RawSummaryPr {
  return {
    state: "OPEN",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    isDraft: false,
    viewerCanUpdate: true,
    isInMergeQueue: false,
    stack: null,
    ...overrides,
  } as RawSummaryPr;
}

function route(
  overrides: Record<string, unknown> = {},
  checks: PollSummaryChecks = { passing: 1 },
  review: PollSummaryReview = {},
  opts = {},
) {
  return routePollSummary(raw(overrides), checks, review, opts);
}

describe("routePollSummary", () => {
  beforeEach(() => {
    mockLoadConfig.mockReturnValue({ actions: { autoMarkReady: true, workWhileQueued: false } });
  });
  it.each([
    [{ state: "CLOSED" }, {}, {}, {}, "cancel", "closed"],
    [{ mergeable: "CONFLICTING" }, {}, {}, {}, "fix_code", "merge-conflicts"],
    [{}, { failing: 1 }, {}, {}, "fix_code", "failing-checks"],
    [{}, { incomplete: true }, {}, {}, "cancel", "appears-ready"],
    [{ mergeable: "UNKNOWN" }, {}, {}, {}, "wait", "pending-or-unknown"],
    [{ mergeStateStatus: "BEHIND" }, {}, {}, { merge: true }, "wait", "pending-or-unknown"],
    [{}, {}, { actionable: 1 }, {}, "fix_code", "review-work"],
    [{}, { inProgress: 1 }, { actionable: 1 }, {}, "fix_code", "review-work"],
    [
      { isInMergeQueue: true },
      {},
      { actionable: 1 },
      { merge: true },
      "wait",
      "review-work-deferred-while-queued",
    ],
    [
      { isDraft: true },
      {},
      {},
      { noAutoMarkReady: true },
      "wait",
      "draft-auto-mark-ready-disabled",
    ],
    [{ isDraft: true }, {}, {}, {}, "mark_ready", "draft-appears-ready"],
    [
      { isDraft: true, viewerCanUpdate: false },
      {},
      {},
      {},
      "escalate",
      "mark-ready-authorization-required",
    ],
    [{}, {}, {}, {}, "cancel", "appears-ready"],
    [{}, { passing: 1 }, {}, { merge: true }, "merge", "appears-ready"],
    [
      { isInMergeQueue: true },
      { passing: 1 },
      {},
      { merge: true },
      "wait",
      "already-in-merge-queue",
    ],
    [
      { stack: { number: 1 } },
      { passing: 1 },
      {},
      { merge: true },
      "fix_code",
      "authoritative-poll-required",
    ],
  ] as const)("routes %# conservatively", (rawOverrides, checks, review, opts, action, reason) => {
    expect(route(rawOverrides, checks, review, opts)).toEqual({ action, reasons: [reason] });
  });

  it("normalizes unrecognized PR states", () => {
    expect(normalizePollSummaryState("FUTURE")).toBe("UNKNOWN");
  });

  it("honors configured auto-mark-ready disablement", () => {
    mockLoadConfig.mockReturnValue({ actions: { autoMarkReady: false, workWhileQueued: false } });
    expect(route({ isDraft: true })).toEqual({
      action: "wait",
      reasons: ["draft-auto-mark-ready-disabled"],
    });
  });
});
