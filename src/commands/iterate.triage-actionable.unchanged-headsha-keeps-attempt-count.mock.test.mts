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
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { hashBody } from "../state/seen-comments.mts";

registerIterateHooks();

describe("runIterate — triage (actionable threads)", () => {
  it("increments the delivery count when HEAD is unchanged", async () => {
    const thread = {
      id: "thread-1",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/foo.mts",
      line: 10,
      startLine: null,
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "Fix this bug",
      url: "",
      createdAtUnix: NOW - 3600,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [thread],
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
    mockReadFixAttempts.mockResolvedValue({
      headSha: "abc123",
      threadAttempts: { "thread-1": 2 },
      threadBodyHashes: { "thread-1": hashBody(thread.body) },
    });

    await runIterate(makeOpts());

    const written = mockWriteFixAttempts.mock.calls[0]?.[1];
    expect(written?.threadAttempts?.["thread-1"]).toBe(3);
  });
  it("does not require journaling actionable threads", async () => {
    const thread = {
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
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [thread],
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

    const result = await runIterate({ ...makeOpts(), instructions: "inline" });

    expect(result.action).toBe("triage");
    if (result.action === "triage") {
      const joined = result.triage.instructions.join("\n");
      const journalMentions = joined.match(/Journal key decisions/g)?.length ?? 0;
      expect(journalMentions).toBe(0);
      expect(joined).toContain("Optional: If you reject a code review suggestion");
      expect(joined).toContain("pr-shepherd apply journal");
      expect(joined).not.toContain("idempotent");
    }
  });
});
