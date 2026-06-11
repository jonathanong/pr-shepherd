import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  mockAutoMinimizeComments,
  mockAutoResolveThreads,
  mockFetchPrBatch,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";
import type { ClassifyItem } from "../classify/types.mts";

vi.mock("../classify/loader.mts", () => ({
  discoverRuleFiles: vi.fn().mockReturnValue(["fake-rule.mjs"]),
  loadRules: vi.fn().mockResolvedValue([
    {
      name: "test-rule",
      file: "fake-rule.mjs",
      rule: (item: ClassifyItem) => {
        if (item.author === "bot-reviewer") return { suppress: true, autoResolve: true };
        if (item.author === "auto-resolver") return { autoResolve: true };
        return null;
      },
    },
  ]),
}));

registerHooks();

describe("runCheck — classification auto-minimize", () => {
  it("self-minimizes suppressed auto-resolve pr-comments when enabled", async () => {
    mockAutoMinimizeComments.mockResolvedValue({ minimized: ["c-bot"], errors: [] });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ comments: [botComment()] }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(mockAutoMinimizeComments).toHaveBeenCalledWith(["c-bot"]);
    expect(report.comments.actionable.map((c) => c.id)).not.toContain("c-bot");
    expect(report.comments.minimizeIds).not.toContain("c-bot");
  });

  it("keeps failed suppressed auto-resolve pr-comments in minimizeIds", async () => {
    mockAutoMinimizeComments.mockResolvedValue({ minimized: [], errors: ["c-bot: failed"] });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ comments: [botComment()] }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(report.comments.minimizeIds).toContain("c-bot");
  });

  it("keeps suppressed auto-resolve pr-comments queued when self-minimize is disabled", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ comments: [botComment()] }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: false });

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(report.comments.minimizeIds).toContain("c-bot");
  });

  it("does not self-minimize auto-resolve-only pr-comments", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        comments: [
          makeComment({
            id: "c-visible",
            author: "auto-resolver",
            authorType: "User" as const,
            body: "Visible comment",
          }),
        ],
      }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(report.comments.actionable.map((c) => c.id)).toContain("c-visible");
    expect(report.comments.minimizeIds).toContain("c-visible");
  });

  it("self-minimizes suppressed auto-resolve review summaries when enabled", async () => {
    mockAutoMinimizeComments.mockResolvedValue({ minimized: ["rev-bot"], errors: [] });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewSummaries: [botReviewSummary()] }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(mockAutoMinimizeComments).toHaveBeenCalledWith(["rev-bot"]);
    expect(report.reviewSummaries.map((r) => r.id)).not.toContain("rev-bot");
    expect(report.ruleAutoResolveReviewSummaryIds ?? []).not.toContain("rev-bot");
  });

  it("self-resolves suppressed auto-resolve threads when enabled", async () => {
    mockAutoResolveThreads.mockResolvedValue({ resolved: ["t-bot"], errors: [] });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [botThread()] }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(mockAutoResolveThreads).toHaveBeenCalledWith(["t-bot"]);
    expect(report.threads.actionable.map((t) => t.id)).not.toContain("t-bot");
    expect(report.threads.ruleAutoResolveIds ?? []).not.toContain("t-bot");
  });
});

function botComment() {
  return makeComment({
    id: "c-bot",
    author: "bot-reviewer",
    authorType: "Bot" as const,
    body: "Bot noise comment",
    isMinimized: false,
  });
}

function botReviewSummary() {
  return {
    id: "rev-bot",
    author: "bot-reviewer",
    authorType: "Bot" as const,
    body: "Bot noise summary",
  };
}

function botThread() {
  return {
    id: "t-bot",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.ts",
    line: 1,
    startLine: null,
    author: "bot-reviewer",
    authorType: "Bot" as const,
    body: "Bot noise",
    url: "",
    createdAtUnix: 0,
  };
}
