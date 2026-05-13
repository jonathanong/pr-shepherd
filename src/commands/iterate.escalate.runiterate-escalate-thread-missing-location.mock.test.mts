// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
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

describe("runIterate — escalate (thread-missing-location)", () => {
  it("escalates when an actionable thread has no file/line reference", async () => {
    const threadNoPath = { ...THREAD, id: "thread-noloc", path: null, line: null };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { ...makeReport().threads, actionable: [threadNoPath] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toContain("thread-missing-location");
      expect(result.escalate.suggestion).toBeTruthy();
    }
  });

  it("escalates when an actionable thread has path but null line", async () => {
    const threadNoLine = { ...THREAD, id: "thread-noline", path: "src/foo.mts", line: null };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { ...makeReport().threads, actionable: [threadNoLine] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toContain("thread-missing-location");
    }
  });
});
