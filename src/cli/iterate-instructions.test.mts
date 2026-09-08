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
  it.each(["wait", "mark_ready", "merge", "cancel", "escalate"] as const)(
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

  it("keeps pending escalation review commands self-contained and format-parity safe", () => {
    const result = makeIterateResult("escalate");
    if (result.action !== "escalate") throw new Error("expected escalate fixture");
    result.escalate.pendingReviewCommands = {
      resolveCommand: {
        argv: ["pr-shepherd", "apply", "review", "42", "--message", "$DISMISS_MESSAGE"],
        requiresHeadSha: true,
        requiresDismissMessage: true,
        hasMutations: true,
        replyThreadIds: ["thread-1"],
      },
    };

    const text = textInstructions(result);
    expect(text).toEqual(jsonInstructions(result));
    expect(text[0]).toContain("Stop — human direction is required");
    expect(text.join(" ")).toContain("$HEAD_SHA");
    expect(text.join(" ")).toContain("$DISMISS_MESSAGE");
    expect(text.join(" ")).toContain("apply review");
    expect(text.at(-1)).toContain("human-directed recovery");
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
    expect(text).toContain("Recommendation: keep polling pr-shepherd at the cadence above");
    expect(textInstructions(result)).toEqual(jsonInstructions(result));
    expect(textInstructions(result)[0]).toContain("non-GraphQL `gh` CLI commands");
    expect(textInstructions(result)[0]).toContain(
      "Do not substitute `gh pr checks` or `gh pr watch` for the Shepherd loop",
    );
    expect(textInstructions(result)[0]).toContain(
      "Resume full-cadence pr-shepherd after the GraphQL quota resets at 2026-08-30T05:12:29.000Z",
    );
    expect(textInstructions(result)[0]).toContain("raise any shorter interval and timeout flags");
    expect(textInstructions(result)[0]).toContain("keep any longer cadence");
    expect(textInstructions(result)[0]).toContain("With a polling CLI command");
    expect(textInstructions(result)[0]).toContain("With a single-tick CLI, API, or MCP call");
    expect(textInstructions(result)[0]).toContain("wait at least 5 minutes before the next tick");
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

  it("applies quota-aware continuation and verbose usage to merge results", () => {
    const result: IterateResult = {
      ...makeIterateResult("merge"),
      quotaWarning: {
        resource: "graphql",
        thresholdPercent: 30,
        remaining: 1400,
        limit: 5000,
        resetAt: 1_788_066_749,
        pollIntervalMinutes: 2,
        pollTimeoutMinutes: 4,
      },
      apiUsage: {
        credentialSources: ["GH_TOKEN"],
        graphql: {
          resource: "graphql",
          requestCount: 1,
          limit: 5000,
          remaining: 1400,
          resetAt: 1_788_066_749,
          measuredQueryCost: 1,
          unmeasuredRequestCount: 0,
          nodeCount: 10,
        },
      },
    };

    const output = formatIterateResult(result, { verbose: true });
    expect(output).toContain("## GitHub API quota warning");
    expect(output).toContain("Recommendation: keep polling pr-shepherd at the cadence above");
    expect(output).toContain("## GitHub API usage");
    expect(textInstructions(result)).toEqual(jsonInstructions(result));
    expect(textInstructions(result).at(-1)).toContain("non-GraphQL `gh` CLI commands");
    expect(textInstructions(result).at(-1)).toContain(
      "Resume full-cadence pr-shepherd after the GraphQL quota resets at 2026-08-30T05:12:29.000Z",
    );
    expect(textInstructions(result).at(-1)).toContain("no more often than every 2 minutes");
  });

  it("applies quota-aware continuation after marking a PR ready", () => {
    const result: IterateResult = {
      ...makeIterateResult("mark_ready"),
      quotaWarning: {
        resource: "graphql",
        thresholdPercent: 10,
        remaining: 400,
        limit: 5000,
        resetAt: 1_788_066_749,
        pollIntervalMinutes: 10,
        pollTimeoutMinutes: 20,
      },
    };

    expect(textInstructions(result)).toEqual(jsonInstructions(result));
    expect(textInstructions(result)[0]).toContain("The CLI marked the PR ready for review");
    expect(textInstructions(result)[0]).toContain("non-GraphQL `gh` CLI commands");
    expect(textInstructions(result)[0]).toContain(
      "Resume full-cadence pr-shepherd after the GraphQL quota resets at 2026-08-30T05:12:29.000Z",
    );
    expect(textInstructions(result)[0]).toContain("no more often than every 10 minutes");
  });
});
