import { describe, expect, it } from "vitest";
import {
  recordApiTelemetry,
  summarizeApiTelemetry,
  withApiTelemetryScope,
} from "./api-telemetry.mts";
import { aggregateEvents } from "./api-telemetry-aggregate.mts";

const resetAt = 1_700_000_000;

/** One REST response through the Claude Code proxy; routes disagree on `X-RateLimit-Used`. */
function proxySample(remaining: number, used: number | undefined, reset = resetAt) {
  recordApiTelemetry({
    kind: "REST",
    method: "GET",
    authSource: "GH_TOKEN",
    credentialFingerprint: "a".repeat(16),
    rateLimit: {
      resource: "core",
      limit: 15000,
      remaining,
      ...(used !== undefined && { used }),
      resetAt: reset,
    },
  });
}

describe("REST core quota samples that disagree within one tick", () => {
  it("reports the lowest remaining and the highest used of the same reset window", async () => {
    await withApiTelemetryScope(async () => {
      proxySample(14517, 483);
      proxySample(14502, 373);
      proxySample(14558, 498);
      proxySample(14600, undefined);
      expect(summarizeApiTelemetry()?.rest).toEqual([
        {
          resource: "core",
          requestCount: 4,
          limit: 15000,
          used: 498,
          remaining: 14502,
          resetAt,
        },
      ]);
    });
  });

  it("combines the conservative halves across nested scopes", async () => {
    await withApiTelemetryScope(async () => {
      await withApiTelemetryScope(async () => proxySample(14502, 373));
      await withApiTelemetryScope(async () => proxySample(14558, 498));
      expect(summarizeApiTelemetry()?.rest).toMatchObject([{ used: 498, remaining: 14502 }]);
    });
  });

  it("still lets a later reset window replace the earlier one", async () => {
    await withApiTelemetryScope(async () => {
      proxySample(100, 14900);
      proxySample(14990, 10, resetAt + 3600);
      expect(summarizeApiTelemetry()?.rest).toMatchObject([
        { used: 10, remaining: 14990, resetAt: resetAt + 3600 },
      ]);
    });
  });

  it("keeps the later reset window when one tick's responses alternate between two windows", async () => {
    // Live #566 cloud tick: routes alternated between a window resetting at 09:36:06 (used ~540)
    // and one resetting at 10:00:39 (used ~652). The later window is the one Shepherd reports.
    const later = resetAt + 1473;
    await withApiTelemetryScope(async () => {
      proxySample(14460, 540);
      proxySample(14348, 652, later);
      proxySample(14460, 540);
      proxySample(14348, 652, later);
      expect(summarizeApiTelemetry()?.rest).toEqual([
        {
          resource: "core",
          requestCount: 4,
          limit: 15000,
          used: 652,
          remaining: 14348,
          resetAt: later,
        },
      ]);
    });
    await withApiTelemetryScope(async () => {
      proxySample(14348, 652, later);
      proxySample(14460, 540);
      expect(summarizeApiTelemetry()?.rest).toMatchObject([
        { used: 652, remaining: 14348, resetAt: later },
      ]);
    });
  });

  it("never merges GraphQL samples from different credentials", () => {
    const graphql = (sequence: number, fingerprint: string, remaining: number, used: number) => ({
      kind: "GraphQL" as const,
      method: "POST",
      authSource: "GH_TOKEN",
      sequence,
      credentialFingerprint: fingerprint,
      rateLimit: { resource: "graphql", limit: 5000, remaining, used, resetAt },
    });
    const aggregate = aggregateEvents([
      graphql(1, "a".repeat(16), 1200, 3800),
      graphql(2, "b".repeat(16), 4900, 3900),
    ]);

    expect(aggregate.graphql.rateLimit).toMatchObject({ remaining: 1200, used: 3800 });
    expect(aggregate.graphql.credentialFingerprint).toBe("a".repeat(16));
    const lower = aggregateEvents([
      graphql(1, "a".repeat(16), 1200, 3800),
      graphql(2, "b".repeat(16), 900, 3700),
    ]);
    expect(lower.graphql.rateLimit).toMatchObject({ remaining: 900, used: 3700 });
    expect(lower.graphql.credentialFingerprint).toBe("b".repeat(16));
  });
});
