import { describe, expect, it } from "vitest";
import {
  recordApiTelemetry,
  summarizeApiTelemetry,
  withApiTelemetryScope,
} from "./api-telemetry.mts";

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
});
