import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — minimized thread filtering", () => {
  it("excludes threads whose top comment is minimized from actionable threads", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          {
            id: "t-visible",
            isResolved: false,
            isOutdated: false,
            isMinimized: false,
            path: "src/foo.ts",
            line: 1,
            startLine: null,
            author: "alice",
            authorType: "Unknown" as const,
            body: "fix this",
            url: "",
            createdAtUnix: 0,
          },
          {
            id: "t-minimized",
            isResolved: false,
            isOutdated: false,
            isMinimized: true,
            path: "src/bar.ts",
            line: 2,
            startLine: null,
            author: "gemini-code-assist",
            authorType: "Unknown" as const,
            body: "You have reached your daily quota limit.",
            url: "",
            createdAtUnix: 0,
          },
        ],
      }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.actionable).toHaveLength(1);
    expect(report.threads.actionable[0]?.id).toBe("t-visible");
  });
});
