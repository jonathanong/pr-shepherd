import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  mockReadFixAttempts,
  mockRunCheck,
  mockUpdateReadyDelay,
  mockWriteFixAttempts,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { hashBody } from "../state/seen-comments.mts";

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

describe("runIterate — escalate (fix-thrash)", () => {
  it("increments attempt count for unchanged thread body and writes body hash", async () => {
    // Use a different stored SHA so isNewSha=true and the increment fires.
    mockReadFixAttempts.mockResolvedValue({
      headSha: "old-sha",
      threadAttempts: { "thread-1": 1 },
      threadBodyHashes: { "thread-1": hashBody("Fix this") },
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [THREAD],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    expect(mockWriteFixAttempts).toHaveBeenCalledOnce();
    const [, written] = mockWriteFixAttempts.mock.calls[0]!;
    expect(written.threadAttempts["thread-1"]).toBe(2);
    expect(written.threadBodyHashes?.["thread-1"]).toBe(hashBody("Fix this"));
  });
  it("resets attempt count when the thread body changes", async () => {
    mockReadFixAttempts.mockResolvedValue({
      headSha: "old-sha",
      threadAttempts: { "thread-1": 2 },
      threadBodyHashes: { "thread-1": hashBody("old body") },
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [{ ...THREAD, body: "new body" }],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    const [, written] = mockWriteFixAttempts.mock.calls[0]!;
    expect(written.threadAttempts["thread-1"]).toBe(1);
    expect(written.threadBodyHashes?.["thread-1"]).toBe(hashBody("new body"));
  });
  it("resets attempt count when the thread body changes on the same HEAD", async () => {
    mockReadFixAttempts.mockResolvedValue({
      headSha: "abc123",
      threadAttempts: { "thread-1": 2 },
      threadBodyHashes: { "thread-1": hashBody("old body") },
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [{ ...THREAD, body: "new body" }],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    const [, written] = mockWriteFixAttempts.mock.calls[0]!;
    expect(written.threadAttempts["thread-1"]).toBe(1);
    expect(written.threadBodyHashes?.["thread-1"]).toBe(hashBody("new body"));
  });
});
