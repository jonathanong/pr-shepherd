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
  it("includes one Shepherd Journal instruction when a failing check and first-look comment are present", async () => {
    const actionableComment = {
      id: "comment-1",
      isMinimized: false,
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "actionable quota note",
      url: "",
      createdAtUnix: NOW - 3_600,
    };
    const firstLookComment = {
      id: "comment-2",
      isMinimized: true,
      firstLookStatus: "minimized" as const,
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "stale but seen",
      url: "",
      createdAtUnix: NOW - 3_600,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        checks: {
          passing: [],
          failing: [
            {
              name: "ci",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/246",
              event: "pull_request",
              runId: "246",
              category: "failing",
            },
          ],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
        comments: {
          actionable: [actionableComment],
          firstLook: [firstLookComment],
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
      expect(result.fix.checks).toHaveLength(1);
      const joined = result.fix.instructions.join("\n");
      const mentions = joined.match(/## Shepherd Journal/g)?.length ?? 0;
      expect(mentions).toBe(1);
      expect(joined).toContain("Shepherd Journal");
    }
  });
});
