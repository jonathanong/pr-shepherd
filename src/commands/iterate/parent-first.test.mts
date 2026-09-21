/* eslint-disable max-lines */
import { describe, expect, it, vi } from "vitest";
import { parentBlocksMarkReady } from "./parent-first.mts";
import type { ShepherdReport } from "../../types.mts";

const mockFetchPollSummary = vi.hoisted(() => vi.fn());
vi.mock("../../github/poll-summary.mts", () => ({ fetchPollSummary: mockFetchPollSummary }));

const report = {
  pr: 42,
  mergeStatus: {
    mergeRequirements: { stack: { number: 7, size: 3, position: 2, baseRefName: "main" } },
  },
} as ShepherdReport;

function summary(overrides: Record<string, unknown> = {}) {
  return {
    prs: [
      {
        pr: 41,
        state: "OPEN",
        action: "cancel",
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        stack: { number: 7, size: 3, position: 1, baseRefName: "main" },
        readyReceipt: true,
      },
      {
        pr: 42,
        state: "OPEN",
        action: "mark_ready",
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        stack: { number: 7, size: 3, position: 2, baseRefName: "main" },
      },
    ],
    ...overrides,
  };
}

describe("parentBlocksMarkReady", () => {
  it("allows a child when the open parent has a current receipt", async () => {
    mockFetchPollSummary.mockResolvedValue(summary());

    await expect(parentBlocksMarkReady(report, { owner: "acme", name: "widgets" })).resolves.toBe(
      false,
    );
  });

  it.each([
    ["draft", { isDraft: true }],
    ["conflicting", { mergeable: "CONFLICTING" }],
    ["failing", { readyReceipt: undefined, action: "fix_code" }],
    ["parent still waiting", { readyReceipt: undefined, action: "wait" }],
  ])("blocks a child while parent is %s", async (_reason, parentChanges) => {
    mockFetchPollSummary.mockResolvedValue(
      summary({ prs: [{ ...summary().prs[0], ...parentChanges }, summary().prs[1]] }),
    );

    await expect(parentBlocksMarkReady(report, { owner: "acme", name: "widgets" })).resolves.toBe(
      true,
    );
  });

  it("allows a child after its parent is merged", async () => {
    mockFetchPollSummary.mockResolvedValue(
      summary({ prs: [{ ...summary().prs[0], state: "MERGED" }, summary().prs[1]] }),
    );

    await expect(parentBlocksMarkReady(report, { owner: "acme", name: "widgets" })).resolves.toBe(
      false,
    );
  });

  it("blocks when the child ancestry is stale", async () => {
    mockFetchPollSummary.mockResolvedValue(
      summary({
        stackAncestry: [{ childPr: 42 }],
      }),
    );

    await expect(parentBlocksMarkReady(report, { owner: "acme", name: "widgets" })).resolves.toBe(
      true,
    );
  });

  it("blocks when an earlier lower layer lost its receipt", async () => {
    mockFetchPollSummary.mockResolvedValue(
      summary({
        prs: [
          { ...summary().prs[0], readyReceipt: undefined },
          {
            ...summary().prs[0],
            pr: 42,
            stack: { number: 7, size: 3, position: 2, baseRefName: "main" },
          },
        ],
      }),
    );

    await expect(parentBlocksMarkReady(report, { owner: "acme", name: "widgets" })).resolves.toBe(
      true,
    );
  });

  it("checks every lower layer before allowing a deeper child", async () => {
    const base = summary();
    const deeperReport = {
      ...report,
      pr: 44,
      mergeStatus: {
        ...report.mergeStatus,
        mergeRequirements: {
          stack: { number: 7, size: 3, position: 3, baseRefName: "main" },
        },
      },
    } as ShepherdReport;
    mockFetchPollSummary.mockResolvedValue({
      prs: [
        base.prs[0],
        {
          ...base.prs[1],
          pr: 43,
          readyReceipt: undefined,
          stack: { number: 7, size: 3, position: 2, baseRefName: "main" },
        },
        {
          ...base.prs[1],
          pr: 44,
          stack: { number: 7, size: 3, position: 3, baseRefName: "main" },
        },
      ],
    });

    await expect(
      parentBlocksMarkReady(deeperReport, { owner: "acme", name: "widgets" }),
    ).resolves.toBe(true);
  });

  it("blocks a deeper child when a lower ancestry boundary is stale", async () => {
    const base = summary();
    const deeperReport = {
      ...report,
      pr: 44,
      mergeStatus: {
        ...report.mergeStatus,
        mergeRequirements: {
          stack: { number: 7, size: 3, position: 3, baseRefName: "main" },
        },
      },
    } as ShepherdReport;
    mockFetchPollSummary.mockResolvedValue({
      prs: [
        base.prs[0],
        {
          ...base.prs[1],
          pr: 43,
          readyReceipt: true,
          stack: { number: 7, size: 3, position: 2, baseRefName: "main" },
        },
        {
          ...base.prs[1],
          pr: 44,
          stack: { number: 7, size: 3, position: 3, baseRefName: "main" },
        },
      ],
      stackAncestry: [{ childPr: 43 }],
    });

    await expect(
      parentBlocksMarkReady(deeperReport, { owner: "acme", name: "widgets" }),
    ).resolves.toBe(true);
  });

  it("ignores a stale boundary above the child being promoted", async () => {
    const base = summary();
    const deeperReport = {
      ...report,
      pr: 44,
      mergeStatus: {
        ...report.mergeStatus,
        mergeRequirements: {
          stack: { number: 7, size: 4, position: 3, baseRefName: "main" },
        },
      },
    } as ShepherdReport;
    mockFetchPollSummary.mockResolvedValue({
      prs: [
        base.prs[0],
        {
          ...base.prs[1],
          pr: 43,
          readyReceipt: true,
          stack: { number: 7, size: 4, position: 2, baseRefName: "main" },
        },
        {
          ...base.prs[1],
          pr: 44,
          readyReceipt: true,
          stack: { number: 7, size: 4, position: 3, baseRefName: "main" },
        },
        {
          ...base.prs[1],
          pr: 45,
          stack: { number: 7, size: 4, position: 4, baseRefName: "main" },
        },
      ],
      stackAncestry: [{ childPr: 45 }],
    });

    await expect(
      parentBlocksMarkReady(deeperReport, { owner: "acme", name: "widgets" }),
    ).resolves.toBe(false);
  });

  it("fails closed when the parent snapshot cannot be fetched", async () => {
    mockFetchPollSummary.mockRejectedValue(new Error("rate limited"));

    await expect(parentBlocksMarkReady(report, { owner: "acme", name: "widgets" })).resolves.toBe(
      true,
    );
  });
});
