import { describe, expect, it, vi } from "vitest";

const { mockFetchPollSummary, mockLookupTrunkConflict } = vi.hoisted(() => ({
  mockFetchPollSummary: vi.fn(),
  mockLookupTrunkConflict: vi.fn(),
}));
vi.mock("../github/poll-summary.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../github/poll-summary.mts")>()),
  fetchPollSummary: mockFetchPollSummary,
}));
vi.mock("./iterate/stack-trunk-conflict.mts", () => ({
  lookupUpperLayerTrunkConflict: mockLookupTrunkConflict,
}));

import { formatIterateResult } from "../cli/iterate-formatter.mts";
import { projectIterateLean } from "../cli/iterate-lean.mts";
import {
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import type { IterateResult } from "../types.mts";

registerIterateHooks();

const stack = { number: 7, size: 3, position: 2, baseRefName: "main" };
const openRequirements = {
  approvals: { current: 0, requiredCount: 0 },
  conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
};

function conflictingReport(headSha?: string) {
  return makeReport({
    ...(headSha && { headSha }),
    baseBranch: "feature-a",
    status: "FAILING",
    mergeStatus: {
      status: "CONFLICTS",
      state: "OPEN",
      isDraft: false,
      mergeable: "CONFLICTING",
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      mergeStateStatus: "DIRTY",
      mergeRequirements: { ...openRequirements, stack },
    },
  });
}

describe("runIterate — upper layer trunk conflict", () => {
  it("updates the lowest open layer from trunk while its base still names a merged parent", async () => {
    mockFetchPollSummary.mockResolvedValue({ prs: [] });
    // The comparison lookup would keep a parent route when behind it. Validated bottom
    // membership takes precedence, so the handler must not make that lookup at all.
    mockLookupTrunkConflict.mockResolvedValue(undefined);
    const report = conflictingReport();
    report.pr = 2547;
    report.baseBranch = "merged-parent";
    report.baseRefOid = "merged-parent-sha";
    report.stackBottomPr = 2547;
    report.mergeStatus.mergeRequirements!.stack = {
      number: 2535,
      size: 6,
      position: 3,
      baseRefName: "main",
    };
    mockRunCheck.mockResolvedValue(report);
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts({ prNumber: 2547 }));
    expect(result.action).toBe("triage");
    expect(mockLookupTrunkConflict).not.toHaveBeenCalled();
    if (result.action !== "triage") return;
    const instructions = result.triage.instructions.join("\n");
    expect(instructions).toContain("gh stack checkout 2535");
    expect(instructions).toContain(
      "check out the head branch of PR #2547 and run `gh stack rebase`.",
    );
    expect(instructions).toContain("gh stack push");
    expect(instructions).not.toContain("--no-trunk");
    expect(instructions).not.toContain("gh pr edit");
    expect(result.mergedBasePullRequests).toBeUndefined();
    expect(result.stackTrunkConflict).toBe("main");
  });

  it("passes the already resolved bottom to a true upper layer's conflict lookup", async () => {
    mockFetchPollSummary.mockResolvedValue({ prs: [] });
    mockLookupTrunkConflict.mockResolvedValue(undefined);
    const report = conflictingReport("b".repeat(40));
    report.stackBottomPr = 11;
    mockRunCheck.mockResolvedValue(report);
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    expect(mockLookupTrunkConflict).toHaveBeenCalledWith(expect.objectContaining({ bottomPr: 11 }));
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;
    expect(result.triage.instructions.join("\n")).toContain("gh stack rebase --upstack --no-trunk");
  });

  it("rebases onto trunk when the upper layer already contains its parent", async () => {
    mockFetchPollSummary.mockResolvedValue({ prs: [] });
    mockLookupTrunkConflict.mockResolvedValue({ trunk: "main", bottomPr: 11 });
    mockRunCheck.mockResolvedValue(conflictingReport("b".repeat(40)));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("triage");
    const triage = result as Extract<IterateResult, { action: "triage" }>;
    expect(triage.stackTrunkConflict).toBe("main");
    expect(triage.triage.instructions.join("\n")).toContain(
      "check out the head branch of PR #11 and run `gh stack rebase`.",
    );
    expect(triage.triage.instructions.join("\n")).not.toContain("--no-trunk");
    const text = formatIterateResult(triage);
    expect(text).toContain("**branch** conflicts with stack trunk `main`");
    expect(text).not.toContain("conflicts with PR base");
    expect(projectIterateLean(triage)).toMatchObject({ stackTrunkConflict: "main" });
  });

  it("keeps the parent rebase when the head SHA is unavailable", async () => {
    mockFetchPollSummary.mockResolvedValue({ prs: [] });
    mockRunCheck.mockResolvedValue(conflictingReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("triage");
    expect(mockLookupTrunkConflict).not.toHaveBeenCalled();
    if (result.action !== "triage") return;
    expect(result.triage.instructions.join("\n")).toContain("--upstack --no-trunk");
    expect(result.stackTrunkConflict).toBeUndefined();
  });
});
