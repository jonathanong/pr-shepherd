// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderResolveCommand } from "./iterate/render.mts";
import {
  registerIterateHooks,
  NOW,
  defaultConfig,
  makeOpts,
  makeReport,
  mockLoadConfig,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("buildResolveCommand (via runIterate) — argv shape invariants", () => {
  it("never puts $HEAD_SHA or --require-sha into argv (they're appended by renderResolveCommand)", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [
            {
              id: "t-1",
              isResolved: false,
              isOutdated: false,
              isMinimized: false,
              path: "src/foo.mts",
              line: 10,
              startLine: null,
              author: "reviewer",
              authorType: "Unknown" as const,
              body: "fix me",
              url: "",
              createdAtUnix: NOW - 3600,
            },
          ],
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
      expect(result.fix.resolveCommand.argv).not.toContain("$HEAD_SHA");
      expect(result.fix.resolveCommand.argv).not.toContain("--require-sha");
      expect(result.fix.resolveCommand.requiresHeadSha).toBe(true);
    }
  });

  it("uses configured package runner in resolve command argv", async () => {
    mockLoadConfig.mockReturnValue({ ...defaultConfig(), cli: { runner: "pnpm" } });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [
            {
              id: "t-1",
              isResolved: false,
              isOutdated: false,
              isMinimized: false,
              path: "src/foo.mts",
              line: 10,
              startLine: null,
              author: "reviewer",
              authorType: "Unknown" as const,
              body: "fix me",
              url: "",
              createdAtUnix: NOW - 3600,
            },
          ],
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
      expect(result.fix.resolveCommand.argv.slice(0, 4)).toEqual([
        "pnpm",
        "exec",
        "pr-shepherd",
        "resolve",
      ]);
      expect(renderResolveCommand(result.fix.resolveCommand)).toContain(
        "pnpm exec pr-shepherd resolve 42",
      );
    }
  });
});
