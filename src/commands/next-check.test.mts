import { describe, it, expect } from "vitest";
import {
  earliestNextCheck,
  MERGE_QUEUE_RECHECK_SECONDS,
  nextCheckCandidates,
  SAFETY_NET_SECONDS,
} from "./next-check.mts";

const NOW_MS = Date.parse("2024-05-15T19:07:00.500Z");

describe("earliestNextCheck", () => {
  it("returns undefined without candidates", () => {
    expect(earliestNextCheck([], NOW_MS)).toBeUndefined();
  });

  it("picks the soonest candidate and rounds up to the minute", () => {
    const next = earliestNextCheck(
      [
        { reason: "safety-net", seconds: 3000 },
        { reason: "ready-delay", seconds: 127 },
      ],
      NOW_MS,
    );
    expect(next).toEqual({
      at: "2024-05-15T19:10:00Z",
      inSeconds: 180,
      reason: "ready-delay",
    });
  });

  it("clamps an overdue deadline to the next minute", () => {
    const next = earliestNextCheck([{ reason: "stall-timeout", seconds: -50 }], NOW_MS);
    expect(next?.inSeconds).toBe(60);
    expect(next?.at).toBe("2024-05-15T19:08:00Z");
  });

  it("defaults to the current time", () => {
    expect(earliestNextCheck([{ reason: "safety-net", seconds: 60 }])?.at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/,
    );
  });
});

describe("nextCheckCandidates", () => {
  it("has no candidates for terminal actions, mark-ready, or a stack draft hold", () => {
    for (const action of ["cancel", "escalate", "merge", "mark_ready"] as const) {
      expect(nextCheckCandidates({ action }, NOW_MS)).toEqual([]);
    }
    expect(nextCheckCandidates({ action: "wait", stackDraftHold: true }, NOW_MS)).toEqual([]);
  });

  it("uses ready-delay for a ready countdown", () => {
    expect(nextCheckCandidates({ action: "ready", remainingSeconds: 90 }, NOW_MS)).toEqual([
      { reason: "ready-delay", seconds: 90 },
    ]);
  });

  it("keeps a merge-pending recheck for a REST merge", () => {
    expect(
      nextCheckCandidates({ action: "merge", restMerge: true, stallDeadlineSeconds: 1 }, 0),
    ).toEqual([{ reason: "merge-pending", seconds: MERGE_QUEUE_RECHECK_SECONDS }]);
  });

  it("uses merge-queue for a queued wait", () => {
    expect(nextCheckCandidates({ action: "wait", queued: true }, NOW_MS)).toEqual([
      { reason: "merge-queue", seconds: MERGE_QUEUE_RECHECK_SECONDS },
    ]);
  });

  it("falls back to the safety net, including a ready action with no countdown", () => {
    const safety = [{ reason: "safety-net", seconds: SAFETY_NET_SECONDS }];
    expect(nextCheckCandidates({ action: "wait" }, NOW_MS)).toEqual(safety);
    expect(nextCheckCandidates({ action: "ready", remainingSeconds: 0 }, NOW_MS)).toEqual(safety);
    expect(nextCheckCandidates({ action: "fix_code", queued: true }, NOW_MS)).toEqual(safety);
  });

  it("adds a stall-timeout deadline relative to now", () => {
    const candidates = nextCheckCandidates(
      { action: "wait", stallDeadlineSeconds: NOW_MS / 1000 + 120 },
      NOW_MS,
    );
    expect(candidates).toContainEqual({
      reason: "stall-timeout",
      seconds: 120,
    });
  });
});
