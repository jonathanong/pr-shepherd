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
// CHANGES_REQUESTED reviews without inline threads → triage (not escalate)
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

describe("runIterate — CHANGES_REQUESTED review with no inline threads routes to triage", () => {
  it("emits triage with --dismiss-review-ids when changesRequestedReviews exist and no inline threads or CI failures", async () => {
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

    expect(result.action).toBe("triage");
    if (result.action === "triage") {
      expect(result.triage.changesRequestedReviews).toHaveLength(1);
      // Non-human CR reviews are auto-dismissed after the agent pushes a fix.
      expect(result.triage.resolveCommand.argv).toContain("--dismiss-review-ids");
      expect(result.triage.resolveCommand.argv).toContain("review-1");
      expect(result.triage.resolveCommand.requiresDismissMessage).toBe(true);
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

    expect(result.action).toBe("triage");
    if (result.action === "triage") {
      expect(result.triage.resolveCommand.argv).toContain("--reply-thread-ids");
      expect(result.triage.resolveCommand.argv).toContain("thread-resolution-only");
      expect(result.triage.resolveCommand.resolveThreadIds).toBeUndefined();
      // The authorized non-human CR dismissal remains actionable on its own.
      expect(result.triage.resolveCommand.argv).toContain("--dismiss-review-ids");
      expect(result.triage.resolveCommand.argv).toContain("review-1");
    }
  });
});
