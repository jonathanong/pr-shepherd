import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  defaultConfig,
  makeOpts,
  makeReport,
  mockLoadConfig,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import type { ReviewThread } from "../types.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

const WAIT_DELAY = { isReady: false, shouldCancel: false, remainingSeconds: 600 };

function makeThread(overrides: Partial<ReviewThread> & { id: string }): ReviewThread {
  return {
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    viewerCanReply: true,
    viewerCanResolve: true,
    path: "src/foo.mts",
    line: 10,
    startLine: null,
    author: "coderabbitai",
    authorType: "Bot",
    body: "Please fix this.",
    url: "https://github.com/owner/repo/pull/42#discussion_r1",
    createdAtUnix: 100,
    ...overrides,
  };
}

describe("superseded approval hiding (iterate.minimize-superseded-approvals)", () => {
  it("hides previous bot approvals except the latest by default when a reviewer approves twice", async () => {
    const older = {
      id: "PRR_AP_1",
      author: "coderabbitai",
      authorType: "Bot" as const,
      viewerCanMinimize: true,
      body: "LGTM 1",
      createdAtUnix: 100,
    };
    const latest = {
      id: "PRR_AP_2",
      author: "coderabbitai",
      authorType: "Bot" as const,
      viewerCanMinimize: true,
      body: "LGTM 2",
      createdAtUnix: 200,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({ approvedReviews: [older, latest], supersededApprovedReviews: [older] }),
    );
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;

    expect(result.triage.reviewSummaryIds).toEqual(["PRR_AP_1"]);
    expect(result.triage.surfacedApprovals.map((r) => r.id)).toEqual(["PRR_AP_2"]);
    expect(result.triage.dismissReviewsCommand?.argv).toContain("--minimize-comment-ids");
    expect(result.triage.dismissReviewsCommand?.argv).toContain("PRR_AP_1");
    expect(result.triage.dismissReviewsCommand?.argv).not.toContain("PRR_AP_2");
  });

  it("hides previous bot approvals after a CHANGES_REQUESTED review unless an approval has unresolved threads", async () => {
    const cleanOldApproval = {
      id: "PRR_AP_CLEAN",
      author: "coderabbitai",
      authorType: "Bot" as const,
      viewerCanMinimize: true,
      body: "LGTM old",
      createdAtUnix: 100,
    };
    const blockedOldApproval = {
      id: "PRR_AP_BLOCKED",
      author: "coderabbitai",
      authorType: "Bot" as const,
      viewerCanMinimize: true,
      body: "LGTM with nit",
      createdAtUnix: 150,
    };
    const cr = {
      id: "PRR_CR_NEW",
      author: "coderabbitai",
      authorType: "Bot" as const,
      viewerCanMinimize: true,
      body: "Found a regression",
      createdAtUnix: 200,
    };
    const approvalThread = makeThread({ id: "PRRT_ap_nit", reviewId: "PRR_AP_BLOCKED" });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [cr],
        approvedReviews: [blockedOldApproval],
        supersededApprovedReviews: [cleanOldApproval, blockedOldApproval],
        threads: {
          actionable: [approvalThread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;

    expect(result.triage.reviewSummaryIds).toEqual(["PRR_AP_CLEAN"]);
    expect(result.triage.surfacedApprovals.map((r) => r.id)).toEqual(["PRR_AP_BLOCKED"]);
    const minIdx =
      result.triage.dismissReviewsCommand?.argv.indexOf("--minimize-comment-ids") ?? -1;
    expect(minIdx).toBeGreaterThan(-1);
    expect(result.triage.dismissReviewsCommand?.argv[minIdx + 1]).toContain("PRR_AP_CLEAN");
    expect(result.triage.dismissReviewsCommand?.argv[minIdx + 1]).not.toContain("PRR_AP_BLOCKED");
  });

  it("respects opt-out iterate.minimize-superseded-approvals: false", async () => {
    const cfg = defaultConfig();
    cfg.iterate["minimize-superseded-approvals"] = false;
    mockLoadConfig.mockReturnValue(cfg);
    const older = {
      id: "PRR_AP_1",
      author: "coderabbitai",
      authorType: "Bot" as const,
      viewerCanMinimize: true,
      body: "LGTM 1",
      createdAtUnix: 100,
    };
    const latest = {
      id: "PRR_AP_2",
      author: "coderabbitai",
      authorType: "Bot" as const,
      viewerCanMinimize: true,
      body: "LGTM 2",
      createdAtUnix: 200,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({ approvedReviews: [older, latest], supersededApprovedReviews: [older] }),
    );
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("wait");
  });
});
