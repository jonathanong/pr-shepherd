import { describe, expect, it } from "vitest";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";
import { formatIterateResult } from "./iterate-formatter.mts";
import { projectIterateLean } from "./iterate-lean.mts";

function textInstructions(result: IterateResult): string[] {
  const section = formatIterateResult(result).split("## Instructions\n\n")[1];
  if (!section) throw new Error("missing Instructions section");
  return section.split("\n").map((line) => line.replace(/^\d+\. /, ""));
}

function jsonInstructions(result: IterateResult): string[] {
  const projection = projectIterateLean(result) as {
    instructions?: string[];
    fix?: { instructions?: string[] };
  };
  const instructions =
    result.action === "fix_code" ? projection.fix?.instructions : projection.instructions;
  if (!instructions) throw new Error("missing JSON instructions");
  return instructions;
}

describe("iterate instruction polling contract", () => {
  it.each(["wait", "mark_ready", "cancel", "escalate"] as const)(
    "%s text instructions equal the JSON instruction array",
    (action) => {
      const result = makeIterateResult(action);
      expect(textInstructions(result)).toEqual(jsonInstructions(result));
    },
  );

  it("fix_code text instructions equal fix.instructions", () => {
    const result = makeIterateResult("fix_code");
    expect(textInstructions(result)).toEqual(jsonInstructions(result));
  });

  it("renders a low-quota warning with transport-aware continuation in text and JSON", () => {
    const result: IterateResult = {
      ...makeIterateResult("wait"),
      quotaWarning: {
        resource: "graphql",
        thresholdPercent: 20,
        remaining: 900,
        limit: 5000,
        used: 4100,
        resetAt: 1_788_066_749,
        pollIntervalMinutes: 5,
        pollTimeoutMinutes: 10,
      },
    };

    const text = formatIterateResult(result);
    expect(text).toContain("## GitHub API quota warning");
    expect(text).toContain("Recommended poll interval: 5 minutes");
    expect(textInstructions(result)).toEqual(jsonInstructions(result));
    expect(textInstructions(result)[0]).toContain(
      "replace any existing interval and timeout flags",
    );
    expect(textInstructions(result)[0]).toContain("MCP or single-tick iteration");
    expect(projectIterateLean(result)).toMatchObject({ quotaWarning: result.quotaWarning });
  });

  it("shows command-scoped API telemetry only in verbose Markdown", () => {
    const result: IterateResult = {
      ...makeIterateResult("wait"),
      apiUsage: {
        credentialSources: ["gh auth token"],
        graphql: {
          resource: "graphql",
          requestCount: 2,
          limit: 5000,
          used: 101,
          remaining: 4899,
          resetAt: 1_788_066_749,
          measuredQueryCost: 2,
          unmeasuredRequestCount: 1,
          nodeCount: 30,
        },
      },
    };

    expect(formatIterateResult(result)).not.toContain("## GitHub API usage");
    const verbose = formatIterateResult(result, { verbose: true });
    expect(verbose).toContain("## GitHub API usage");
    expect(verbose).toContain("GraphQL measured cost: 2 · unmeasured requests: 1");
  });
});
