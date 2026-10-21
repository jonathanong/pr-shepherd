/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testConfig } from "../../test-helpers/config/test-config.mts";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import type { PollSummaryChecks, PollSummaryReview } from "../types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { normalizePollSummaryState, routePollSummary } from "./poll-summary-route.mts";
import { runWithGithubTransport } from "./transport.mts";

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
    mockLoadConfig.mockReturnValue(testConfig());
  });
  it.each([
    [
      { transport: "rest", mergeStateStatus: "NEW_SERVER_STATE" },
      {},
      {},
      { merge: true },
      "wait",
      "pending-or-unknown",
    ],
    [{ state: "CLOSED" }, {}, {}, {}, "cancel", "closed"],
    [{ mergeable: "CONFLICTING" }, {}, {}, {}, "triage", "merge-conflicts"],
    [{}, { failing: 1 }, {}, {}, "triage", "failing-checks"],
    [{}, { incomplete: true }, {}, {}, "cancel", "appears-ready"],
    [
      { transport: "rest", transportUnavailable: [{ field: "reviewThreads", reason: "denied" }] },
      {},
      {},
      {},
      "escalate",
      "transport-unsupported",
    ],
    [
      {
        transport: "rest",
        mergeStateStatus: "BLOCKED",
        transportUnavailable: [{ field: "reviewDecision", reason: "no aggregate" }],
      },
      {},
      {},
      {},
      "wait",
      "pending-or-unknown",
    ],
    [
      {
        transport: "rest",
        mergeStateStatus: "BLOCKED",
        transportUnavailable: [{ field: "branchRules", reason: "denied" }],
      },
      {},
      {},
      {},
      "escalate",
      "transport-unsupported",
    ],
    [{ mergeable: "UNKNOWN" }, {}, {}, {}, "wait", "pending-or-unknown"],
    [{ mergeStateStatus: "BEHIND" }, {}, {}, { merge: true }, "wait", "pending-or-unknown"],
    [{}, {}, { actionable: 1 }, {}, "triage", "review-work"],
    [{}, { inProgress: 1 }, { actionable: 1 }, {}, "triage", "review-work"],
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
      "cancel",
      "draft-auto-mark-ready-disabled",
    ],
    [
      { isDraft: true },
      { incomplete: true },
      {},
      { noAutoMarkReady: true },
      "triage",
      "draft-readiness-verification-required",
    ],
    [
      { isDraft: true },
      {},
      { incomplete: true },
      { noAutoMarkReady: true },
      "triage",
      "draft-readiness-verification-required",
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
      { autoMergeRequest: { mergeMethod: "SQUASH" } },
      { passing: 1 },
      {},
      { merge: true },
      "wait",
      "already-auto-merging",
    ],
    [
      { stack: { number: 1 } },
      { passing: 1 },
      {},
      { merge: true },
      "triage",
      "authoritative-poll-required",
    ],
    [
      { stack: { number: 1 } },
      { passing: 1 },
      {},
      { merge: true, stackPrNumber: 42 },
      "merge",
      "appears-ready",
    ],
  ] as const)("routes %# conservatively", (rawOverrides, checks, review, opts, action, reason) => {
    expect(route(rawOverrides, checks, review, opts)).toEqual({ action, reasons: [reason] });
  });

  it("routes missing required checks as fix work when Actions is idle", () => {
    expect(
      route(
        { mergeStateStatus: "BLOCKED" },
        { passing: 4, unreportedRequired: ["build", "tests"] },
      ),
    ).toEqual({ action: "triage", reasons: ["unreported-required-checks"] });
  });

  it("keeps waiting while a workflow or check run is still in progress", () => {
    expect(
      route(
        { mergeStateStatus: "BLOCKED" },
        { passing: 4, inProgress: 1, unreportedRequired: ["build"] },
      ),
    ).toEqual({ action: "wait", reasons: ["pending-or-unknown"] });
    expect(
      route(
        { mergeStateStatus: "BLOCKED" },
        { passing: 4, unreportedRequired: ["build"], actionsWorkflowInProgress: true },
      ),
    ).toEqual({ action: "wait", reasons: ["pending-or-unknown"] });
  });

  it("normalizes unrecognized PR states", () => {
    expect(normalizePollSummaryState("FUTURE")).toBe("UNKNOWN");
  });

  it.each([
    ["an explicit selection stops at the clean draft", {}, "cancel"],
    ["a stack selection leaves the draft held", { stackPrNumber: 42 }, "cancel"],
  ] as const)("routes a disabled draft the viewer cannot update: %s", (_case, opts, action) => {
    const routed = route(
      { isDraft: true, viewerCanUpdate: false },
      {},
      {},
      {
        noAutoMarkReady: true,
        ...opts,
      },
    );
    expect(routed.action).toBe(action);
  });

  it("honors configured auto-mark-ready disablement", () => {
    mockLoadConfig.mockReturnValue(testConfig({ "mark-ready": { auto: false } }));
    expect(route({ isDraft: true })).toEqual({
      action: "cancel",
      reasons: ["draft-auto-mark-ready-disabled"],
    });
  });

  it("reports standard REST ready as unsupported while preserving known denials", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    try {
      const unknown = await runWithGithubTransport("rest", async () =>
        route({ transport: "rest", isDraft: true, viewerCanUpdate: undefined }),
      );
      const knownAllowed = await runWithGithubTransport("rest", async () =>
        route({ transport: "rest", isDraft: true, viewerCanUpdate: true }),
      );
      const denied = await runWithGithubTransport("rest", async () =>
        route({ transport: "rest", isDraft: true, viewerCanUpdate: false }),
      );
      expect([unknown, knownAllowed]).toEqual(
        Array(2).fill({ action: "escalate", reasons: ["transport-unsupported"] }),
      );
      expect(denied).toEqual({
        action: "escalate",
        reasons: ["mark-ready-authorization-required"],
      });
      await expect(
        runWithGithubTransport("graphql", async () =>
          route({ isDraft: true, viewerCanUpdate: undefined }),
        ),
      ).resolves.toEqual({
        action: "escalate",
        reasons: ["mark-ready-authorization-required"],
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
