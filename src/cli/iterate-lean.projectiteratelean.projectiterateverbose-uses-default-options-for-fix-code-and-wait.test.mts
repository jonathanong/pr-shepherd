import { describe, it, expect } from "vitest";
import {
  makeIterateResult,
  projectIterateLean,
  projectIterateVerbose,
} from "../../test-helpers/cli/iterate-lean.test-support.mts";

describe("projectIterateLean", () => {
  // ---------------------------------------------------------------------------
  // Base field gating
  // ---------------------------------------------------------------------------

  it("projectIterateVerbose uses default options for fix_code and wait", () => {
    const fixResult = makeIterateResult("fix_code");
    if (fixResult.action !== "fix_code") throw new Error("unreachable");
    expect((projectIterateVerbose(fixResult) as typeof fixResult).fix.instructions[0]).toContain(
      "pr-shepherd 42",
    );

    const wait = projectIterateVerbose(makeIterateResult("wait")) as Record<string, unknown>;
    expect(wait.instructions).toBeDefined();
  });
  it("escalate (empty arrays): omits triggers and all empty arrays", () => {
    const lean = projectIterateLean(makeIterateResult("escalate")) as Record<string, unknown>;
    expect(lean.action).toBe("escalate");
    const esc = lean.escalate as Record<string, unknown>;
    expect(esc.triggers).toBeUndefined();
    expect(esc.unresolvedThreads).toBeUndefined();
    expect(esc.ambiguousComments).toBeUndefined();
    expect(esc.changesRequestedReviews).toBeUndefined();
    expect(esc.thrashHistory).toBeUndefined();
    expect(esc.suggestion).toBe("check manually");
    expect(esc.humanMessage).toBeDefined();
  });
  it("escalate (non-empty arrays): includes triggers and populated arrays", () => {
    const result = makeIterateResult("escalate");
    if (result.action !== "escalate") throw new Error("unreachable");
    result.escalate.triggers = ["fix-thrash"];
    result.escalate.unresolvedThreads = [
      { id: "t1", path: "f.ts", line: 1, author: "a", body: "b", url: "" },
    ];
    result.escalate.ambiguousComments = [
      { id: "c1", author: "a", authorType: "Unknown" as const, body: "?", url: "" },
    ];
    result.escalate.changesRequestedReviews = [
      { id: "rv1", author: "a", authorType: "Unknown" as const, body: "" },
    ];
    result.escalate.thrashHistory = [{ threadId: "t1", attempts: 3 }];

    const lean = projectIterateLean(result) as Record<string, unknown>;
    const esc = lean.escalate as Record<string, unknown>;
    expect((esc.triggers as unknown[]).length).toBe(1);
    expect((esc.unresolvedThreads as unknown[]).length).toBe(1);
    expect((esc.ambiguousComments as unknown[]).length).toBe(1);
    expect((esc.changesRequestedReviews as unknown[]).length).toBe(1);
    expect((esc.thrashHistory as unknown[]).length).toBe(1);
  });
});
