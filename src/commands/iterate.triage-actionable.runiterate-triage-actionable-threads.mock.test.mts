import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — triage (actionable threads)", () => {
  it("surfaces an unlocated other-human resolution-only thread as reply-only", async () => {
    const outdated = {
      id: "thread-outdated",
      isResolved: false,
      isOutdated: true,
      isMinimized: false,
      path: "src/old.mts",
      line: null,
      startLine: null,
      author: "reviewer",
      authorType: "User" as const,
      body: "old location",
      url: "",
      createdAtUnix: NOW - 3600,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [],
          resolutionOnly: [outdated],
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

    expect(result.action).toBe("triage");
    if (result.action === "triage") {
      expect(result.triage.threads).toHaveLength(0);
      expect(result.triage.resolutionOnlyThreads.map((t) => t.id)).toEqual(["thread-outdated"]);
      expect(result.triage.resolveCommand.replyThreadIds).toEqual(["thread-outdated"]);
      expect(result.triage.resolveCommand.resolveThreadIds).toBeUndefined();
      expect(result.triage.resolveCommand.argv).toContain("--reply-thread-ids");
      expect(result.triage.resolveCommand.argv).toContain("thread-outdated");
      expect(result.triage.resolveCommand.requiresHeadSha).toBe(false);
      expect(result.triage.resolveCommand.requiresDismissMessage).toBe(true);
      expect(result.triage.resolveCommand.hasMutations).toBe(true);
      expect(result.triage.instructions.join("\n")).not.toContain("Rebase and push");
    }
  });
  it("returns action: triage with 2 actionable threads and 0 CI failures", async () => {
    const thread1 = {
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
    const thread2 = {
      id: "thread-2",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/bar.mts",
      line: 20,
      startLine: null,
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "Fix this too",
      url: "",
      createdAtUnix: NOW - 3600,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [thread1, thread2],
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

    expect(result.action).toBe("triage");
    if (result.action === "triage") {
      expect(result.triage.threads).toHaveLength(2);
      expect(result.triage.actionableComments).toHaveLength(0);
      expect(result.triage.checks).toHaveLength(0);
      const joined = result.triage.instructions.join("\n");
      expect(joined).toContain("Rerun Shepherd now.");
      expect(joined).not.toContain("## Cancelled runs");
    }
  });
});
