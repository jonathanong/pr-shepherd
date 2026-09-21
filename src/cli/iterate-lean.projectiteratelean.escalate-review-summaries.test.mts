import { describe, it, expect } from "vitest";
import {
  makeIterateResult,
  projectIterateLean,
} from "../../test-helpers/cli/iterate-lean.test-support.mts";

describe("projectIterateLean", () => {
  it("escalate: preserves review summaries that must be surfaced", () => {
    const result = makeIterateResult("escalate");
    if (result.action !== "escalate") throw new Error("expected escalate fixture");
    result.escalate.firstLookSummaries = [
      { id: "review-1", author: "bot", authorType: "Bot", body: "first look" },
    ];
    result.escalate.editedSummaries = [
      { id: "review-2", author: "bot", authorType: "Bot", body: "edited", edited: true },
    ];

    const lean = projectIterateLean(result) as {
      escalate: { firstLookSummaries?: unknown; editedSummaries?: unknown };
    };
    expect(lean.escalate.firstLookSummaries).toEqual(result.escalate.firstLookSummaries);
    expect(lean.escalate.editedSummaries).toEqual(result.escalate.editedSummaries);
  });
});
