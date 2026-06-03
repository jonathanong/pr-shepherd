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

registerIterateHooks();

describe("runIterate — fix_code (actionable threads)", () => {
  it("does not increment fix-attempt counter when headSha is unchanged (no push detected)", async () => {
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
    // Stored state has the same sha as the current HEAD → no push detected
    mockReadFixAttempts.mockResolvedValue({ headSha: "abc123", threadAttempts: { "thread-1": 2 } });

    await runIterate(makeOpts());

    const written = mockWriteFixAttempts.mock.calls[0]?.[1];
    // Counter must NOT increment because sha is unchanged
    expect(written?.threadAttempts?.["thread-1"]).toBe(2);
  });
  it("includes Shepherd Journal instruction when there are actionable threads", async () => {
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

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      const joined = result.fix.instructions.join("\n");
      const journalMentions = joined.match(/## Shepherd Journal/g)?.length ?? 0;
      expect(joined).toContain("Shepherd Journal");
      expect(journalMentions).toBe(1);
      expect(joined).toContain("pr-shepherd journal");
      expect(joined).toContain("idempotent");
    }
  });
});
