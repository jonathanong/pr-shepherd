import { describe, it, expect } from "vitest";
import {
  registerHooks,
  makeOpts,
  makeReport,
  mockMarkSeen,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate.fix-code-in-progress.test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerHooks();

describe("fix_code — check annotation seen markers", () => {
  it("marks only rendered check annotations as seen after null-run check dedupe", async () => {
    const firstCheck = {
      id: "CR_external_1",
      name: "external-ci",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://checks.example/1",
      event: "pull_request" as const,
      runId: null,
      category: "failing" as const,
      annotations: [
        {
          id: "check_annotation_rendered",
          path: "src/a.mts",
          startLine: 1,
          endLine: 1,
          level: "FAILURE",
          message: "Rendered annotation.",
        },
      ],
    };
    const droppedDuplicate = {
      id: "CR_external_2",
      name: "external-ci",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://checks.example/2",
      event: "pull_request" as const,
      runId: null,
      category: "failing" as const,
      annotations: [
        {
          id: "check_annotation_dropped",
          path: "src/b.mts",
          startLine: 2,
          endLine: 2,
          level: "FAILURE",
          message: "Dropped annotation.",
        },
      ],
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [firstCheck, droppedDuplicate],
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
      expect(result.fix.checks).toHaveLength(1);
      expect(result.fix.checks[0]?.annotations?.[0]?.id).toBe("check_annotation_rendered");
    }
    expect(mockMarkSeen).toHaveBeenCalledWith(
      { owner: "owner", repo: "repo", pr: 42 },
      "check_annotation_rendered",
      expect.stringContaining("Rendered annotation."),
    );
    expect(mockMarkSeen).not.toHaveBeenCalledWith(
      expect.any(Object),
      "check_annotation_dropped",
      expect.anything(),
    );
  });
});
