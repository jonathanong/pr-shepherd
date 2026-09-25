import { describe, expect, it } from "vitest";
import { stackDraftHold } from "./parent-first.mts";
import type { ShepherdReport } from "../../types.mts";

function report(
  stack: boolean,
  options: {
    isDraft?: boolean;
    status?: "READY" | "IN_PROGRESS";
    blockingBotReviewInProgress?: boolean;
  } = {},
): ShepherdReport {
  return {
    status: options.status ?? "READY",
    mergeStatus: {
      isDraft: options.isDraft ?? true,
      blockingBotReviewInProgress: options.blockingBotReviewInProgress,
      ...(stack && {
        mergeRequirements: {
          approvals: { current: 0, requiredCount: 0 },
          conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
          stack: { number: 7, size: 2, position: 2, baseRefName: "main" },
        },
      }),
    },
  } as ShepherdReport;
}

describe("stackDraftHold", () => {
  it("holds a stack draft when automatic mark-ready is off", () => {
    expect(stackDraftHold(report(true), false)).toEqual({ kind: "auto-mark-ready-disabled" });
  });

  it("lets a clean stack draft be marked ready on its own", () => {
    expect(stackDraftHold(report(true), true)).toBeUndefined();
  });

  it("does not hold a pull request outside a native stack", () => {
    expect(stackDraftHold(report(false), false)).toBeUndefined();
  });

  it("does not hold a stack draft that is not ready yet", () => {
    expect(stackDraftHold(report(true, { status: "IN_PROGRESS" }), false)).toBeUndefined();
  });

  it("does not hold a ready stack draft while a blocking bot review is in progress", () => {
    expect(
      stackDraftHold(report(true, { blockingBotReviewInProgress: true }), false),
    ).toBeUndefined();
  });
});
