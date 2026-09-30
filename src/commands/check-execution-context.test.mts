import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadStackTopology = vi.hoisted(() => vi.fn());
const mockGraphqlWithRateLimit = vi.hoisted(() => vi.fn());
vi.mock("../github/stack-read.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../github/stack-read.mts")>()),
  readStackTopology: mockReadStackTopology,
}));
vi.mock("../github/client.mts", () => ({ graphqlWithRateLimit: mockGraphqlWithRateLimit }));

import { loadMergeTargetStatus } from "../github/merge-target-rules.mts";
import { findStaleNativeStackAncestry } from "./iterate/stale-ancestry.mts";
import { createCheckExecutionContext } from "./check-execution-context.mts";
import type { ShepherdReport } from "../types.mts";

const repo = { owner: "acme", name: "widgets" };
const parent = {
  number: 41,
  state: "OPEN",
  headRefName: "feature-parent",
  headRefOid: "parent-current",
  baseRefName: "main",
  baseRefOid: "main-current",
};
const child = {
  number: 42,
  state: "OPEN",
  headRefName: "feature-child",
  headRefOid: "child-current",
  baseRefName: "feature-parent",
  baseRefOid: "parent-old",
};
const topology = {
  stackNumber: 7,
  stackSize: 2,
  viewerLogin: "acme",
  viewerCanAdminister: true,
  ordered: [parent, child],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockReadStackTopology.mockResolvedValue(topology);
  mockGraphqlWithRateLimit.mockResolvedValue({
    data: { repository: { ref: { compare: { behindBy: 0 } } } },
  });
});

describe("per-tick check execution context", () => {
  it("shares one child topology read across merge-target and ancestry checks", async () => {
    const context = createCheckExecutionContext();
    const target = await loadMergeTargetStatus(
      {
        ...repo,
        pr: 42,
        baseRefName: "feature-parent",
        headRefName: "feature-child",
        localContexts: [],
        stack: { baseRefName: "main" },
      },
      context,
    );
    const ancestry = await findStaleNativeStackAncestry(
      {
        pr: 42,
        mergeStatus: {
          mergeRequirements: { stack: { number: 7, position: 2, size: 2, baseRefName: "main" } },
        },
      } as ShepherdReport,
      repo,
      context,
    );
    expect(target.stackBottomPr).toBe(41);
    expect(ancestry?.childBaseRefOid).toBe("parent-old");
    expect(mockReadStackTopology).toHaveBeenCalledTimes(1);
    expect(mockReadStackTopology).toHaveBeenCalledWith(42, repo);
  });

  it("does not fetch topology for the bottom stack layer", async () => {
    const context = createCheckExecutionContext();
    await loadMergeTargetStatus(
      {
        ...repo,
        pr: 41,
        baseRefName: "main",
        headRefName: "feature-parent",
        localContexts: [],
        stack: { baseRefName: "main" },
      },
      context,
    );
    expect(mockReadStackTopology).not.toHaveBeenCalled();
  });

  it("deduplicates a rejected read within one tick and retries in a fresh context", async () => {
    mockReadStackTopology.mockRejectedValueOnce(new Error("temporary GraphQL failure"));
    mockReadStackTopology.mockResolvedValueOnce(topology);
    const context = createCheckExecutionContext();
    await expect(context.readStackTopology(42, repo)).rejects.toThrow("temporary GraphQL failure");
    await expect(context.readStackTopology(42, repo)).rejects.toThrow("temporary GraphQL failure");
    expect(mockReadStackTopology).toHaveBeenCalledTimes(1);
    const nextTick = createCheckExecutionContext();
    await expect(nextTick.readStackTopology(42, repo)).resolves.toEqual(topology);
    expect(mockReadStackTopology).toHaveBeenCalledTimes(2);
  });
});
