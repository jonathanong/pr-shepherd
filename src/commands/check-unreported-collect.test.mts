import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github/merge-target-rules.mts", () => ({
  loadMergeTargetStatus: vi.fn(),
  loadBaseBehindBy: vi.fn(),
}));

import { loadBaseBehindBy, loadMergeTargetStatus } from "../github/merge-target-rules.mts";
import { collectUnreportedRequired } from "./check-unreported.mts";
import type { BatchPrData, CheckRun } from "../types.mts";

const target = vi.mocked(loadMergeTargetStatus);
const behind = vi.mocked(loadBaseBehindBy);

describe("collectUnreportedRequired", () => {
  beforeEach(() => {
    target.mockReset();
    behind.mockReset();
  });

  it("records how far a BLOCKED non-stack head is behind its base", async () => {
    target.mockResolvedValue({ contexts: ["backend", "gitleaks"] });
    behind.mockResolvedValue(93);
    const fields = await collectUnreportedRequired({
      batchData: {
        baseRefName: "main",
        headRefName: "feature",
        headRefOid: "a".repeat(40),
        baseTipOid: "b".repeat(40),
        branchRules: { requiredStatusCheckContexts: ["backend", "gitleaks"] },
      } as BatchPrData,
      checks: [{ name: "gitleaks" } as CheckRun],
      suites: [],
      owner: "acme",
      name: "widgets",
      pr: 723,
      relevantEvents: ["pull_request"],
    });
    expect(fields.unreportedRequiredChecks).toEqual(["backend"]);
    expect(fields.baseBehindBy).toBe(93);
    expect(behind).toHaveBeenCalledWith("acme", "widgets", "main", "a".repeat(40), {
      stateKey: { owner: "acme", repo: "widgets", pr: 723 },
      baseTipOid: "b".repeat(40),
    });
  });

  it("skips the base compare once every required check has reported", async () => {
    target.mockResolvedValue({ contexts: ["gitleaks"] });
    const fields = await collectUnreportedRequired({
      batchData: {
        baseRefName: "main",
        headRefName: "feature",
        branchRules: { requiredStatusCheckContexts: ["gitleaks"] },
      } as BatchPrData,
      checks: [{ name: "gitleaks" } as CheckRun],
      suites: [],
      owner: "acme",
      name: "widgets",
      pr: 723,
      relevantEvents: ["pull_request"],
    });
    expect(fields.unreportedRequiredChecks).toBeUndefined();
    expect(fields.baseBehindBy).toBeUndefined();
    expect(behind).not.toHaveBeenCalled();
  });

  it("does not compare a stack layer against its own parent", async () => {
    target.mockResolvedValue({
      contexts: ["backend"],
      trunkBehindBy: () => Promise.resolve(2),
      stackBottomPr: 1,
    });
    const fields = await collectUnreportedRequired({
      batchData: {
        baseRefName: "main",
        headRefName: "feature",
        stack: { number: 7, size: 1, position: 1, baseRefName: "main" },
        branchRules: { requiredStatusCheckContexts: ["backend"] },
      } as BatchPrData,
      checks: [],
      suites: [],
      owner: "acme",
      name: "widgets",
      pr: 723,
      relevantEvents: ["pull_request"],
    });
    expect(fields.trunkBehindBy).toBe(2);
    expect(fields.baseBehindBy).toBeUndefined();
    expect(behind).not.toHaveBeenCalled();
  });
});
