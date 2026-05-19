import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  NOW,
  defaultConfig,
  makeOpts,
  makeReport,
  makeReview,
  mockLoadConfig,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Review summary minimize — issue #70
// ---------------------------------------------------------------------------

describe("runIterate — review summary auto-minimize", () => {
  const botSummary = makeReview("PRR_BOT", "copilot-pull-request-reviewer", "overview");

  it("omits APPROVED reviews from minimize list by default (approvals: false)", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        approvedReviews: [
          { id: "PRR_AP", author: "alice", authorType: "Unknown" as const, body: "" },
        ],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("wait");
  });
  it("includes APPROVED reviews in minimize list when cfg.minimizeApprovals is true", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeApprovals = true;
    mockLoadConfig.mockReturnValue(cfg);
    mockRunCheck.mockResolvedValue(
      makeReport({
        approvedReviews: [
          { id: "PRR_AP", author: "alice", authorType: "Unknown" as const, body: "" },
        ],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_AP"]);
  });
  it("filters APPROVED reviews through minimizeComments when approval minimization is enabled", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeApprovals = true;
    cfg.iterate.minimizeComments = "bots";
    mockLoadConfig.mockReturnValue(cfg);
    mockRunCheck.mockResolvedValue(
      makeReport({
        approvedReviews: [
          { id: "PRR_AP_BOT", author: "app", authorType: "Bot", body: "" },
          { id: "PRR_AP_USER", author: "alice", authorType: "User", body: "" },
        ],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_AP_BOT"]);
  });
  it("summary-only PR triggers fix_code (not wait) so the summary can be minimized", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
  });
  it("includes reviewSummaryIds in fix_code result when both a thread and a bot summary are present", async () => {
    const t1 = {
      id: "PRRT_x",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/foo.mts",
      line: 10,
      startLine: null,
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "Use a const here.\n\n```suggestion\nconst foo = 1;\n```",
      url: "",
      createdAtUnix: NOW - 3600,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [t1],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        reviewSummaries: [botSummary],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT"]);
  });
});
