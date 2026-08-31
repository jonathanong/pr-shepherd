/* eslint-disable max-lines */
import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  mockAutoMinimizeComments,
  mockAutoResolveThreads,
  mockFetchPrBatch,
  mockLoadSeenMap,
} from "../../test-helpers/commands/check.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runCheck } from "./check.mts";
import type { ClassifyItem } from "../classify/types.mts";

vi.mock("../classify/loader.mts", () => ({
  discoverRuleFiles: vi.fn().mockReturnValue(["fake-rule.mjs"]),
  loadRules: vi.fn().mockResolvedValue([
    {
      name: "auto-minimize-rule",
      file: "auto-minimize-rule.mjs",
      rule: classifyNoiseForAutoMinimizeTests,
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

  it("surfaces a suppressed auto-resolve pr-comment when minimization is denied", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ comments: [{ ...botComment(), viewerCanMinimize: false }] }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(report.comments.actionable.map((comment) => comment.id)).toContain("c-bot");
    expect(report.comments.minimizeIds).not.toContain("c-bot");
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

  it.each([false, undefined])(
    "surfaces a suppressed auto-resolve review summary when minimization is %s",
    async (viewerCanMinimize) => {
      mockFetchPrBatch.mockResolvedValue({
        data: makeBatchData({
          reviewSummaries: [{ ...botReviewSummary(), viewerCanMinimize }],
        }),
      });

      const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

      expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
      expect(report.firstLookSummaries).toEqual([
        expect.objectContaining({ id: "rev-bot", viewerCanMinimize }),
      ]);
      expect(report.ruleAutoResolveReviewSummaryIds ?? []).not.toContain("rev-bot");
    },
  );

  it("re-surfaces an edited denied auto-resolve review summary", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [
          { ...botReviewSummary(), body: "Updated summary", viewerCanMinimize: false },
        ],
      }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["rev-bot", { seenAt: 1000, bodyHash: hashBody("Old summary") }]]),
    );

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(report.editedSummaries).toEqual([
      expect.objectContaining({ id: "rev-bot", body: "Updated summary" }),
    ]);
    expect(report.ruleAutoResolveReviewSummaryIds ?? []).not.toContain("rev-bot");
    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
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

  it("surfaces a suppressed auto-resolve thread when resolve authorization is denied", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [{ ...botThread(), viewerCanResolve: false }],
      }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(mockAutoResolveThreads).not.toHaveBeenCalled();
    expect(report.threads.actionable.map((thread) => thread.id)).toContain("t-bot");
    expect(report.threads.ruleAutoResolveIds).toContain("t-bot");
  });

  it("skips a seen suppressed thread when resolve authorization remains denied", async () => {
    const thread = { ...botThread(), viewerCanResolve: false };
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [thread] }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([[thread.id, { seenAt: 1000, bodyHash: hashBody(thread.body) }]]),
    );

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(report.threads.actionable).toEqual([]);
    expect(report.threads.ruleAutoResolveIds ?? []).not.toContain(thread.id);
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

function classifyNoiseForAutoMinimizeTests(item: ClassifyItem) {
  switch (item.author) {
    case "bot-reviewer":
      return { suppress: true, autoResolve: true };
    case "auto-resolver":
      return { autoResolve: true };
    default:
      return null;
  }
}
