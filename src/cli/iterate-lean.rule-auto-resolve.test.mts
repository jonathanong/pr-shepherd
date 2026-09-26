import { describe, expect, it } from "vitest";
import {
  makeIterateResult,
  projectIterateLean,
} from "../../test-helpers/cli/iterate-lean.test-support.mts";

describe("projectIterateLean ruleAutoResolve", () => {
  it("omits the field when the tick did not auto-resolve", () => {
    expect(projectIterateLean(makeIterateResult("wait"))).not.toHaveProperty("ruleAutoResolve");
  });

  it("keeps the summary and drops empty collections", () => {
    const result = makeIterateResult("wait");
    const lean = projectIterateLean({
      ...result,
      ruleAutoResolve: {
        summary: "auto-resolved 1 thread (rule: noise)",
        threads: [{ id: "t1" } as never],
        minimized: [],
        errors: [],
      },
    }) as { ruleAutoResolve: Record<string, unknown> };
    expect(lean.ruleAutoResolve).toEqual({
      summary: "auto-resolved 1 thread (rule: noise)",
      threads: [{ id: "t1" }],
    });
  });
});
