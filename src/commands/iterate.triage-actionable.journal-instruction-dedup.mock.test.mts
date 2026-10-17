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
  it("requires no journal update when a failing check and first-look comment are present", async () => {
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

    const result = await runIterate({ ...makeOpts(), instructions: "inline" });

    expect(result.action).toBe("triage");
    if (result.action === "triage") {
      expect(result.triage.checks).toHaveLength(1);
      const joined = result.triage.instructions.join("\n");
      const mentions = joined.match(/Journal key decisions/g)?.length ?? 0;
      expect(mentions).toBe(0);
      expect(joined).toContain("Optional: If you reject a code review suggestion");
      expect(joined.match(/pr-shepherd apply journal/g)).toHaveLength(1);
    }
  });
});
