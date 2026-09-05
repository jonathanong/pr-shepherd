import { describe, it, expect } from "vitest";
import {
  makeIterateResult,
  projectIterateLean,
} from "../../test-helpers/cli/iterate-lean.test-support.mts";

describe("projectIterateLean", () => {
  it("escalate: preserves GitHub stack details", () => {
    const result = makeIterateResult("escalate");
    if (result.action !== "escalate") throw new Error("expected escalate fixture");
    result.escalate.stack = {
      number: 7,
      size: 3,
      position: 2,
      baseRefName: "stack/7/1",
    };
    const lean = projectIterateLean(result) as {
      escalate: { stack?: unknown };
    };
    expect(lean.escalate.stack).toEqual(result.escalate.stack);
  });
});
