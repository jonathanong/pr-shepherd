import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
  mockLoadSeenMap,
  mockMarkSeen,
  makeThread,
  makeComment,
} from "../../test-helpers/commands/check.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — first-look items", () => {
  it("re-surfaces edited resolved and minimized threads and minimized comments", async () => {
    const resolved = makeThread({
      id: "t-resolved",
      isResolved: true,
      isOutdated: false,
      body: "resolved new",
    });
    const minimizedThread = makeThread({
      id: "t-minimized",
      isMinimized: true,
      body: "minimized new",
    });
    const minimizedComment = makeComment({
      id: "c-minimized",
      isMinimized: true,
      body: "comment new",
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [resolved, minimizedThread],
        comments: [minimizedComment],
      }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([
        ["t-resolved", { seenAt: 1000, bodyHash: hashBody("resolved old") }],
        ["t-minimized", { seenAt: 1000, bodyHash: hashBody("minimized old") }],
        ["c-minimized", { seenAt: 1000, bodyHash: hashBody("comment old") }],
      ]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.firstLook.map((t) => [t.id, t.firstLookStatus, t.edited])).toEqual([
      ["t-resolved", "resolved", true],
      ["t-minimized", "minimized", true],
    ]);
    expect(report.comments.firstLook.map((c) => [c.id, c.firstLookStatus, c.edited])).toEqual([
      ["c-minimized", "minimized", true],
    ]);
  });
  it("calls markSeen for each first-look item with the item body", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true, body: "fix this" });
    const minimized = makeComment({ id: "c-min", isMinimized: true, body: "nit" });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated], comments: [minimized] }),
    });
    mockLoadSeenMap.mockResolvedValue(new Map());

    await runCheck(BASE_OPTS);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "t-outdated", "fix this");
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "c-min", "nit");
  });
});
