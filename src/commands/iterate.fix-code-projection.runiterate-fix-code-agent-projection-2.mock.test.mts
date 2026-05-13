// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

function makeActionableCheck(runId: string, name = "typecheck") {
  return {
    name,
    status: "COMPLETED" as const,
    conclusion: "FAILURE" as const,
    detailsUrl: `https://github.com/owner/repo/actions/runs/${runId}`,
    event: "pull_request",
    runId,
    category: "failing" as const,
  };
}

describe("runIterate — fix_code agent projection", () => {
  it("external status check (runId=null) — instructions split by runId presence", async () => {
    const externalCheck = {
      name: "codecov/patch",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://app.codecov.io/...",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
    };
    const ghActionsCheck = makeActionableCheck("run-77", "lint");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [externalCheck, ghActionsCheck],
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
      const instructionsJoined = result.fix.instructions.join("\n");
      // GitHub Actions check with runId — agent fetches logs and decides rerun vs fix
      expect(instructionsJoined).toContain("gh run view <runId> --log-failed");
      expect(instructionsJoined).toContain("gh run rerun");
      // External check with detailsUrl but no runId — open details URL
      expect(instructionsJoined).toContain("external status check");
      expect(instructionsJoined).toContain("open the linked URL");
      // No bare-check bullets in this test, so the `(no runId)` instruction is omitted.
      expect(instructionsJoined).not.toContain("(no runId)");
    }
  });
  it("bare check (runId=null, no detailsUrl) — emits escalate-to-human instruction", async () => {
    const bareCheck = {
      name: "mystery",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [bareCheck],
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
      const instructionsJoined = result.fix.instructions.join("\n");
      expect(instructionsJoined).toContain("(no runId)");
      expect(instructionsJoined).toMatch(/escalate/i);
      // external-check instruction is gated separately and must NOT appear for a bare check.
      expect(instructionsJoined).not.toContain("external status check");
    }
  });
});
