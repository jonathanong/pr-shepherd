import { describe, expect, it } from "vitest";
import { conversationResolutionProven, transportReadinessGaps } from "./transport-evidence.mts";

const threadStatus = { field: "reviewThreads.status", reason: "REST has no thread state" };
const rest = { transport: "rest" as const, transportUnavailable: [threadStatus] };

describe("unknown REST thread status", () => {
  it("is a gap without a conversation-resolution policy", () => {
    expect(transportReadinessGaps(rest, "CLEAN")).toEqual([threadStatus]);
    expect(transportReadinessGaps(rest, "CLEAN", false)).toEqual([threadStatus]);
  });

  it("is a gap when GitHub does not report CLEAN", () => {
    expect(transportReadinessGaps(rest, "BLOCKED", true)).toEqual([threadStatus]);
  });

  it("is proven away by CLEAN plus required conversation resolution", () => {
    expect(transportReadinessGaps(rest, "CLEAN", true)).toEqual([]);
    expect(conversationResolutionProven("CLEAN", true)).toBe(true);
    expect(conversationResolutionProven("CLEAN", undefined)).toBe(false);
  });

  it("never clears other missing feedback", () => {
    const review = { field: "reviewSummaries", reason: "unavailable" };
    expect(
      transportReadinessGaps(
        { ...rest, transportUnavailable: [threadStatus, review] },
        "CLEAN",
        true,
      ),
    ).toEqual([review]);
  });
});
