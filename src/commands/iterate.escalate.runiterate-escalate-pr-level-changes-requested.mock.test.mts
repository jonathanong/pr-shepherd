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

// ---------------------------------------------------------------------------
// CHANGES_REQUESTED reviews without inline threads → fix_code (not escalate)
// ---------------------------------------------------------------------------

const RESOLUTION_ONLY_THREAD = {
  id: "thread-resolution-only",
  isResolved: false,
  isOutdated: true,
  isMinimized: false,
  path: "src/foo.mts",
  line: null,
  startLine: null,
  author: "reviewer",
  authorType: "User" as const,
  body: "Already addressed on an old diff",
  url: "",
  createdAtUnix: NOW - 3600,
};

describe("runIterate — CHANGES_REQUESTED review with no inline threads routes to fix_code", () => {
  it("emits fix_code without generated dismissals when changesRequestedReviews exist and no inline threads or CI failures", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [
          { id: "review-1", author: "boss", authorType: "Unknown" as const, body: "Needs rework" },
        ],
        threads: {
          actionable: [],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        comments: { actionable: [], firstLook: [] },
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
      expect(result.fix.changesRequestedReviews).toHaveLength(1);
      expect(result.fix.resolveCommand.argv).not.toContain("--dismiss-review-ids");
      expect(result.fix.resolveCommand.argv).not.toContain("review-1");
      expect(result.fix.resolveCommand.requiresDismissMessage).toBe(false);
    }
  });

  it("does NOT escalate when changesRequestedReviews + resolution-only threads exist", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [
          { id: "review-1", author: "boss", authorType: "Unknown" as const, body: "Needs rework" },
        ],
        threads: {
          actionable: [],
          resolutionOnly: [RESOLUTION_ONLY_THREAD],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        comments: { actionable: [], firstLook: [] },
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
      expect(result.fix.resolveCommand.argv).toContain("--reply-thread-ids");
      expect(result.fix.resolveCommand.argv).toContain("thread-resolution-only");
    }
  });
});
