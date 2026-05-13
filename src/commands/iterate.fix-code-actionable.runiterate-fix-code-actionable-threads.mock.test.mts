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

describe("runIterate — fix_code (actionable threads)", () => {
  it("routes resolution-only threads to resolve without requiring a push SHA", async () => {
    const outdated = {
      id: "thread-outdated",
      isResolved: false,
      isOutdated: true,
      isMinimized: false,
      path: "src/old.mts",
      line: null,
      startLine: null,
      author: "reviewer",
      authorType: "Unknown" as const,
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

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.threads).toHaveLength(0);
      expect(result.fix.resolutionOnlyThreads.map((t) => t.id)).toEqual(["thread-outdated"]);
      expect(result.fix.resolveCommand.argv).toContain("--resolve-thread-ids");
      expect(result.fix.resolveCommand.argv).toContain("thread-outdated");
      expect(result.fix.resolveCommand.requiresHeadSha).toBe(false);
      expect(result.fix.instructions.join("\n")).not.toContain("Rebase and push");
    }
  });
  it("returns action: fix_code with 2 actionable threads and 0 CI failures", async () => {
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

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.threads).toHaveLength(2);
      expect(result.fix.actionableComments).toHaveLength(0);
      expect(result.fix.checks).toHaveLength(0);
      expect(result.cancelled).toHaveLength(0);
      const joined = result.fix.instructions.join("\n");
      // push with no cancelled → stop-iteration but no no-recancel warning
      expect(joined).toContain("Stop this iteration");
      expect(joined).not.toContain("Do not re-run");
    }
  });
});
