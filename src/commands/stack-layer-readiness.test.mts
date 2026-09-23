import { describe, expect, it } from "vitest";
import { stackLayerBlockReason } from "./stack-layer-readiness.mts";
import type { PollSummaryItem } from "../types.mts";

function layer(overrides: Partial<PollSummaryItem> = {}): PollSummaryItem {
  return {
    pr: 41,
    repo: "acme/widgets",
    title: "Bottom layer",
    url: "https://github.com/acme/widgets/pull/41",
    action: "cancel",
    reasons: [],
    state: "OPEN",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    headRefName: "feature-a",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    stack: { number: 7, size: 2, position: 1 },
    readyReceipt: true,
    ...overrides,
  } as PollSummaryItem;
}

const queueRemoval = { reason: "CI_FAILURE", createdAtUnix: 1 } as PollSummaryItem["queueRemoval"];
const checks = (counts: Partial<NonNullable<PollSummaryItem["checks"]>>) =>
  ({ passing: 0, failing: 0, inProgress: 0, ...counts }) as PollSummaryItem["checks"];

describe("stackLayerBlockReason", () => {
  it("releases an open, mergeable layer with a current READY receipt", () => {
    expect(stackLayerBlockReason(layer())).toBeUndefined();
  });

  it.each([
    ["closed", { state: "CLOSED" }],
    ["closed", { state: "UNKNOWN" }],
    ["draft", { isDraft: true }],
    ["conflicting", { mergeable: "CONFLICTING" }],
    ["conflicting", { mergeStateStatus: "DIRTY" }],
    ["queue-removal", { queueRemoval }],
    ["failing-checks", { checks: checks({ failing: 1 }) }],
    ["review-work", { review: { actionable: 1 } }],
    ["checks-in-progress", { checks: checks({ inProgress: 1 }) }],
    ["merge-state", { mergeable: "UNKNOWN" }],
    ["merge-state", { mergeStateStatus: "BEHIND" }],
    ["merge-state", { mergeStateStatus: "BLOCKED" }],
    ["no-ready-receipt", { readyReceipt: undefined }],
  ] as [string, Partial<PollSummaryItem>][])("blocks with %s for %j", (reason, overrides) => {
    expect(stackLayerBlockReason(layer(overrides))).toBe(reason);
  });

  it("reports the earliest blocker when several apply", () => {
    expect(
      stackLayerBlockReason(
        layer({ isDraft: true, mergeable: "CONFLICTING", readyReceipt: undefined }),
      ),
    ).toBe("draft");
  });

  it("lets the merge queue own checks and merge state for a queued layer", () => {
    expect(
      stackLayerBlockReason(
        layer({
          isInMergeQueue: true,
          mergeable: "UNKNOWN",
          mergeStateStatus: "BEHIND",
          checks: checks({ inProgress: 2 }),
        }),
      ),
    ).toBeUndefined();
  });

  it.each([
    ["failing-checks", { checks: checks({ failing: 1 }) }],
    ["no-ready-receipt", { readyReceipt: undefined }],
  ] as [string, Partial<PollSummaryItem>][])(
    "still blocks a queued layer with %s",
    (reason, overrides) => {
      expect(stackLayerBlockReason(layer({ isInMergeQueue: true, ...overrides }))).toBe(reason);
    },
  );
});
