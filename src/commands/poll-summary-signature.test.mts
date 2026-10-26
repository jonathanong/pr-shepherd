import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { planPollSummary } from "./poll-summary-instructions.mts";
import { summaryStatusSignature } from "./poll-summary-signature.mts";
import type { PollSummaryItem } from "../types.mts";

function sig(overrides: Partial<PollSummaryItem> = {}): string {
  return summaryStatusSignature(
    planPollSummary(stack([row(1, 1, { action: "wait", ...overrides })]), false).result,
  );
}

describe("summaryStatusSignature", () => {
  const base = { review: { comments: 1 }, checks: { passing: 1, failing: 1 } };

  it("ignores raw totals and ignored, skipped, filtered, superseded check counts", () => {
    expect(
      sig({
        review: { comments: 9, reviews: 2, threads: 3 },
        checks: { passing: 1, failing: 1, ignored: 1, skipped: 2, filtered: 1, superseded: 1 },
      }),
    ).toBe(sig(base));
  });

  it("changes on actionable, incomplete, and decision-relevant check state", () => {
    const original = sig(base);
    expect(sig({ ...base, review: { actionable: 1 } })).not.toBe(original);
    expect(sig({ ...base, review: { incomplete: true } })).not.toBe(original);
    expect(sig({ ...base, checks: { passing: 2, failing: 1 } })).not.toBe(original);
    expect(sig({ ...base, checks: { passing: 1, inProgress: 1 } })).not.toBe(original);
    expect(sig({ ...base, mergeStateStatus: "DIRTY" })).not.toBe(original);
  });

  it("handles items without review or checks", () => {
    expect(typeof sig({ review: undefined, checks: undefined })).toBe("string");
  });
});
