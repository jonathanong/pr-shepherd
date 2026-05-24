import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  REPO,
  mockGetPrHeadSha,
} from "../../test-helpers/comments/resolve.test-support.mts";
import { applyResolveOptions } from "./resolve.mts";

registerHooks();

describe("applyResolveOptions — requireSha", () => {
  it("proceeds immediately when SHA matches on first poll", async () => {
    mockGetPrHeadSha.mockResolvedValue("abc123");
    const result = await applyResolveOptions(1, REPO, {
      resolveThreadIds: ["t-1"],
      requireSha: "abc123",
    });
    expect(result.resolvedThreads).toEqual(["t-1"]);
    expect(mockGetPrHeadSha).toHaveBeenCalledTimes(1);
  });

  it("throws 'Push may still be in transit' after max attempts", async () => {
    vi.useFakeTimers();
    try {
      mockGetPrHeadSha.mockResolvedValue("old-sha");
      // Attach error handler immediately so the rejection is never "unhandled".
      const settledPromise = applyResolveOptions(1, REPO, {
        resolveThreadIds: [],
        requireSha: "expected-sha",
      }).catch((e: unknown) => e as Error);
      // shaPoll.maxAttempts=10, intervalMs=2000 → 9 intervals × 2000ms = 18s
      await vi.runAllTimersAsync();
      const caught = await settledPromise;
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain("Push may still be in transit");
    } finally {
      vi.useRealTimers();
    }
  });
});
