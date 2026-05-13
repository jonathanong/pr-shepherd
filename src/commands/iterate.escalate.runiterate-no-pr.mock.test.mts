// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerIterateHooks, NOW, mockGetCurrentPrNumber } from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Escalate
// ---------------------------------------------------------------------------

const THREAD = {
  id: "thread-1",
  isResolved: false,
  isOutdated: false,
  isMinimized: false,
  path: "src/foo.mts",
  line: 10,
  startLine: null,
  author: "reviewer",
  authorType: "Unknown" as const,
  body: "Fix this",
  url: "",
  createdAtUnix: NOW - 3600,
};

const RESOLUTION_ONLY_THREAD = {
  ...THREAD,
  id: "thread-resolution-only",
  isOutdated: true,
  line: null,
  body: "Already addressed on an old diff",
};

describe("runIterate — no PR", () => {
  it("throws when no PR number is passed and no current PR is found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runIterate({ format: "json" })).rejects.toThrow("No open PR found");
  });
});
