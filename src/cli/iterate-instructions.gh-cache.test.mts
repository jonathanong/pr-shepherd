import { describe, expect, it } from "vitest";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";
import { formatIterateResult } from "./iterate-formatter.mts";
import { projectIterateLean } from "./iterate-lean.mts";

function merge(extra: object): IterateResult {
  const base = makeIterateResult("merge");
  if (base.action !== "merge") throw new Error("expected merge");
  return {
    ...base,
    merge: {
      ...base.merge,
      restFallbackCommand: { argv: ["gh", "api", "-X", "PUT", "repos/o/r/pulls/42/merge"] },
      ...extra,
    },
  };
}

function textSteps(result: IterateResult): string[] {
  const section = formatIterateResult(result).split("## Instructions\n\n")[1] ?? "";
  return section.split("\n").map((line) => line.replace(/^\d+\. /, ""));
}

describe("merge instructions", () => {
  const stale = {
    ghCacheStaleRateLimit: {
      paths: ["/home/u/.cache/gh/aa/bb/cc dd"],
      expiresAt: "2026-11-20T10:00:00.000Z",
    },
  };

  it("puts the stale gh cache step before the merge command, matching JSON", () => {
    const result = merge(stale);
    const steps = textSteps(result);
    expect(steps[0]).toContain("fail until 2026-11-20T10:00:00.000Z");
    expect(steps[0]).toContain('`rm "/home/u/.cache/gh/aa/bb/cc dd"`');
    expect(steps[1]).toContain("Run the auto-merge command");
    const projection = projectIterateLean(result) as {
      instructions: string[];
      merge: { ghCacheStaleRateLimit: unknown };
    };
    expect(projection.instructions).toEqual(steps);
    expect(projection.merge.ghCacheStaleRateLimit).toEqual(stale.ghCacheStaleRateLimit);
  });

  it("omits the step and the field when nothing stale was found", () => {
    const result = merge({});
    expect(textSteps(result).join("\n")).not.toContain("HTTP cache");
    expect(JSON.stringify(projectIterateLean(result))).not.toContain("ghCacheStaleRateLimit");
  });

  it("prints the REST fallback line for an ordinary gh merge", () => {
    expect(textSteps(merge({})).join("\n")).toContain(
      "If `gh` reports a GraphQL rate limit, run: `gh api -X PUT repos/o/r/pulls/42/merge`.",
    );
  });
});
