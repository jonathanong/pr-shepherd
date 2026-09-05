import { describe, it, expect, vi } from "vitest";

// Not mocked by check.test-support.mts (no existing check.mts test exercises the
// classify-rule pipeline), so this file adds its own minimal mock: one rule that
// suppresses + auto-resolves a single thread ID, independent of the real filesystem.
vi.mock("../../src/classify/loader.mts", () => ({
  discoverRuleFiles: () => ["fake-rule.mts"],
  loadRules: () =>
    Promise.resolve([
      {
        name: "fake-rule",
        file: "fake-rule.mts",
        rule: (item: { id: string }) =>
          item.id === "t-denied" ? { suppress: true, autoResolve: true } : null,
      },
    ]),
}));

import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeThread,
  mockMarkSeen,
  mockFetchPrBatch,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — merge-queue deferral with a denied rule-auto-resolve match", () => {
  it("does not mark a denied rule-match thread seen while queued, even though a raw suppression set still contains its ID", async () => {
    // The rule wants to auto-resolve this thread, but the viewer can't (viewerCanResolve:
    // false), so it's restored to visible — it still lands in the raw `suppressedThreadIds`
    // set the rule engine produces. That must not let it slip past the deferral gate via the
    // unconditional "already-suppressed" seen-marker write.
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        isInMergeQueue: true,
        isMergeQueueEnabled: true,
        reviewThreads: [
          makeThread({
            id: "t-denied",
            author: "reviewer",
            authorType: "User",
            viewerCanResolve: false,
          }),
        ],
      }),
    });

    const report = await runCheck({ ...BASE_OPTS, merge: true });

    expect(report.threads.actionable.map((t) => t.id)).toContain("t-denied");
    expect(mockMarkSeen).not.toHaveBeenCalledWith(expect.anything(), "t-denied", expect.anything());
  });
});
