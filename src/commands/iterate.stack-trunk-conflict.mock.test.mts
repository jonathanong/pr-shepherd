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
    expect(result.action).toBe("fix_code");
    const fix = result as Extract<IterateResult, { action: "fix_code" }>;
    expect(fix.stackTrunkConflict).toBe("main");
    expect(fix.fix.instructions.join("\n")).toContain(
      "check out the head branch of PR #11 and run `gh stack rebase`;",
    );
    expect(fix.fix.instructions.join("\n")).not.toContain("--no-trunk");
    const text = formatIterateResult(fix);
    expect(text).toContain("**branch** conflicts with stack trunk `main`");
    expect(text).not.toContain("conflicts with PR base");
    expect(projectIterateLean(fix)).toMatchObject({ stackTrunkConflict: "main" });
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
    expect(result.action).toBe("fix_code");
    expect(mockLookupTrunkConflict).not.toHaveBeenCalled();
    if (result.action !== "fix_code") return;
    expect(result.fix.instructions.join("\n")).toContain("--upstack --no-trunk");
    expect(result.stackTrunkConflict).toBeUndefined();
  });
});
