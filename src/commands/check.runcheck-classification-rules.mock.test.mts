import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
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
      rule: (item: ClassifyItem) =>
        item.author === "bot-reviewer" ? { suppress: true, autoResolve: true } : null,
    },
  ]),
}));

registerHooks();

describe("runCheck — classification rules", () => {
  it("suppresses matching threads and populates ruleAutoResolveIds", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          {
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
          },
          {
            id: "t-human",
            isResolved: false,
            isOutdated: false,
            isMinimized: false,
            path: "src/bar.ts",
            line: 2,
            startLine: null,
            author: "human",
            authorType: "User" as const,
            body: "Real review",
            url: "",
            createdAtUnix: 0,
          },
        ],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.actionable.map((t) => t.id)).not.toContain("t-bot");
    expect(report.threads.actionable.map((t) => t.id)).toContain("t-human");
    expect(report.threads.ruleAutoResolveIds).toContain("t-bot");
  });

  it("suppresses matching review summaries and populates ruleAutoResolveReviewSummaryIds", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [
          {
            id: "rev-bot",
            author: "bot-reviewer",
            authorType: "Bot" as const,
            body: "Bot noise summary",
          },
        ],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.reviewSummaries.map((r) => r.id)).not.toContain("rev-bot");
    expect(report.ruleAutoResolveReviewSummaryIds).toContain("rev-bot");
  });
});
