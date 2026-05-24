import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — prescriptive fields: log strings", () => {
  it("fix_code startup failure instructions avoid failed job logs", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [
            {
              name: "CI",
              status: "COMPLETED",
              conclusion: "STARTUP_FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/25406234225",
              event: "pull_request",
              runId: "25406234225",
              category: "failing",
              summary: "ci: skip secret-backed jobs for dependency bots",
            },
          ],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
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
      expect(joined).toContain("[conclusion: STARTUP_FAILURE]");
      expect(joined).toContain("gh run view <runId>");
      expect(joined).toContain("gh run rerun <runId>");
      expect(joined).not.toContain("gh run view <runId> --log-failed");
      expect(joined).not.toContain("gh run rerun <runId> --failed");
    }
  });
  it("mark_ready.log mentions PR number", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        mergeStatus: {
          status: "CLEAN",
          state: "OPEN",
          isDraft: true,
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          blockingBotReviewInProgress: false,
          mergeStateStatus: "DRAFT",
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("mark_ready");
    if (result.action === "mark_ready") {
      expect(result.log).toMatch(/MARKED READY/);
      expect(result.log).toMatch(/42/);
    }
  });
});
