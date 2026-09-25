/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findParentMarkReadyBlock, heldByLowerLayer, stackDraftHold } from "./parent-first.mts";
import type { IterateResult, ShepherdReport, StackStatus } from "../../types.mts";
import { makeIterateResult } from "../../../fixtures/cli-parser.iterate-fixtures.mts";

const mockFetchPollSummary = vi.hoisted(() => vi.fn());
vi.mock("../../github/poll-summary.mts", () => ({ fetchPollSummary: mockFetchPollSummary }));

const repo = { owner: "acme", name: "widgets" };

function layerReport(pr: number, stack: StackStatus | undefined, isDraft = true): ShepherdReport {
  return {
    pr,
    mergeStatus: { isDraft, ...(stack && { mergeRequirements: { stack } }) },
  } as ShepherdReport;
}

const report = layerReport(42, { number: 7, size: 3, position: 2, baseRefName: "main" });

function layer(pr: number, position: number, overrides: Record<string, unknown> = {}) {
  return {
    pr,
    state: "OPEN",
    action: "cancel",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    stack: { number: 7, size: 4, position, baseRefName: "main" },
    readyReceipt: true,
    ...overrides,
  };
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    prs: [layer(41, 1), layer(42, 2, { action: "mark_ready", readyReceipt: undefined })],
    ...overrides,
  };
}

const deeperReport = layerReport(44, { number: 7, size: 4, position: 3, baseRefName: "main" });

describe("findParentMarkReadyBlock", () => {
  beforeEach(() => {
    mockFetchPollSummary.mockReset();
  });

  it("allows a child when the open parent has a current receipt", async () => {
    mockFetchPollSummary.mockResolvedValue(summary());

    await expect(findParentMarkReadyBlock(report, repo)).resolves.toBeUndefined();
  });

  it.each([
    ["draft", { isDraft: true }],
    ["conflicting", { mergeable: "CONFLICTING" }],
    ["failing-checks", { readyReceipt: undefined, checks: { failing: 1 } }],
    ["no-ready-receipt", { readyReceipt: undefined, action: "wait" }],
    ["queue-removal", { queueRemoval: { reason: "CI_FAILURE", createdAtUnix: 1 } }],
    ["closed", { state: "CLOSED" }],
  ])("names the parent while it is blocked by %s", async (reason, parentChanges) => {
    mockFetchPollSummary.mockResolvedValue(
      summary({ prs: [{ ...summary().prs[0], ...parentChanges }, summary().prs[1]] }),
    );

    await expect(findParentMarkReadyBlock(report, repo)).resolves.toEqual({ pr: 41, reason });
  });

  it("allows a child after its parent is merged", async () => {
    mockFetchPollSummary.mockResolvedValue(
      summary({ prs: [{ ...summary().prs[0], state: "MERGED" }, summary().prs[1]] }),
    );

    await expect(findParentMarkReadyBlock(report, repo)).resolves.toBeUndefined();
  });

  it("cannot attribute the child's own stale ancestry to a lower layer", async () => {
    mockFetchPollSummary.mockResolvedValue(summary({ stackAncestry: [{ childPr: 42 }] }));

    await expect(findParentMarkReadyBlock(report, repo)).resolves.toBe("unverifiable");
  });

  it("names the lowest blocking layer before a deeper child", async () => {
    mockFetchPollSummary.mockResolvedValue({
      prs: [
        layer(41, 1, { isDraft: true }),
        layer(43, 2, { readyReceipt: undefined }),
        layer(44, 3, { readyReceipt: undefined }),
      ],
    });

    await expect(findParentMarkReadyBlock(deeperReport, repo)).resolves.toEqual({
      pr: 41,
      reason: "draft",
    });
  });

  it("names every lower layer, not only the immediate parent", async () => {
    mockFetchPollSummary.mockResolvedValue({
      prs: [layer(41, 1), layer(43, 2, { readyReceipt: undefined }), layer(44, 3)],
    });

    await expect(findParentMarkReadyBlock(deeperReport, repo)).resolves.toEqual({
      pr: 43,
      reason: "no-ready-receipt",
    });
  });

  it("names a lower layer whose own ancestry boundary is stale", async () => {
    mockFetchPollSummary.mockResolvedValue({
      prs: [layer(41, 1), layer(43, 2), layer(44, 3, { readyReceipt: undefined })],
      stackAncestry: [{ parentPr: 41, childPr: 43 }],
    });

    await expect(findParentMarkReadyBlock(deeperReport, repo)).resolves.toEqual({
      pr: 43,
      reason: "stale-ancestry",
    });
  });

  it("ignores a stale boundary above the child being promoted", async () => {
    mockFetchPollSummary.mockResolvedValue({
      prs: [layer(41, 1), layer(43, 2), layer(44, 3), layer(45, 4, { readyReceipt: undefined })],
      stackAncestry: [{ childPr: 45 }],
    });

    await expect(findParentMarkReadyBlock(deeperReport, repo)).resolves.toBeUndefined();
  });

  it.each([
    ["the child is missing", { prs: [layer(41, 1)] }],
    ["the child is no longer open", { prs: [layer(41, 1), layer(42, 2, { state: "CLOSED" })] }],
    ["a lower layer is missing", { prs: [layer(42, 2)] }],
  ])("fails closed when %s", async (_case, fetched) => {
    mockFetchPollSummary.mockResolvedValue(fetched);

    await expect(findParentMarkReadyBlock(report, repo)).resolves.toBe("unverifiable");
  });

  it("fails closed when the parent snapshot cannot be fetched", async () => {
    mockFetchPollSummary.mockRejectedValue(new Error("rate limited"));

    await expect(findParentMarkReadyBlock(report, repo)).resolves.toBe("unverifiable");
  });

  it("fails closed on an unknown stack position without reading the stack", async () => {
    const unknown = layerReport(42, { number: 7, size: 3, position: 0, baseRefName: "main" });

    await expect(findParentMarkReadyBlock(unknown, repo)).resolves.toBe("unverifiable");
    expect(mockFetchPollSummary).not.toHaveBeenCalled();
  });

  it.each([
    ["the bottom layer", layerReport(41, { number: 7, size: 3, position: 1, baseRefName: "main" })],
    ["a PR outside a native stack", layerReport(41, undefined)],
  ])("never blocks %s", async (_case, bottom) => {
    await expect(findParentMarkReadyBlock(bottom, repo)).resolves.toBeUndefined();
    expect(mockFetchPollSummary).not.toHaveBeenCalled();
  });
});

describe("stackDraftHold", () => {
  const lowerLayer = { pr: 41, reason: "no-ready-receipt" } as const;

  it("names the lower layer even when the session disables automatic mark-ready", () => {
    expect(stackDraftHold(report, false, lowerLayer)).toEqual({
      kind: "lower-layer-not-ready",
      lowerLayer,
    });
  });

  it.each([
    [false, undefined, { kind: "auto-mark-ready-disabled" }],
    [false, "unverifiable", { kind: "lower-layer-not-ready" }],
    [true, "unverifiable", { kind: "lower-layer-not-ready" }],
    [true, undefined, undefined],
  ] as const)(
    "with autoMarkReady=%s and parent block %s holds as %j",
    (autoMarkReady, parentBlock, expected) => {
      expect(stackDraftHold(report, autoMarkReady, parentBlock)).toEqual(expected);
    },
  );

  it.each([
    ["a non-draft layer", layerReport(42, report.mergeStatus.mergeRequirements?.stack, false)],
    ["a draft outside a native stack", layerReport(42, undefined)],
  ])("never holds %s", (_case, layerUnderTest) => {
    expect(stackDraftHold(layerUnderTest, false, lowerLayer)).toBeUndefined();
  });
});

describe("heldByLowerLayer", () => {
  const wait = makeIterateResult("wait");

  it.each([
    ["an ordinary wait", wait, undefined],
    [
      "an unattributed hold",
      { ...wait, stackDraftHold: { kind: "lower-layer-not-ready" } },
      undefined,
    ],
    ["a disabled-session hold", { ...wait, stackDraftHold: { kind: "auto-mark-ready-disabled" } }],
    [
      "a named lower layer",
      {
        ...wait,
        stackDraftHold: { kind: "lower-layer-not-ready", lowerLayer: { pr: 41, reason: "draft" } },
      },
      { pr: 41, reason: "draft" },
    ],
    ["a non-wait result", makeIterateResult("cancel"), undefined],
  ] as [string, IterateResult, unknown][])(
    "returns the lower layer for %s",
    (_case, result, expected) => {
      expect(heldByLowerLayer(result)).toEqual(expected);
    },
  );
});
