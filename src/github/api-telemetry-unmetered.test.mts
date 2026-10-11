import { describe, expect, it } from "vitest";
import { formatApiUsage } from "../cli/api-usage-formatter.mts";
import {
  recordApiTelemetry,
  summarizeApiTelemetry,
  withApiTelemetryScope,
} from "./api-telemetry.mts";

const core = { resource: "core", limit: 5000, remaining: 4990, used: 10, resetAt: 1_700_000_000 };

describe("REST requests without rate-limit headers", () => {
  it("counts them as unmetered instead of dropping them or charging core", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({ kind: "REST", method: "GET", authSource: "GH_TOKEN", rateLimit: core });
      await withApiTelemetryScope(async () => {
        // The Claude Code proxy's ccr/review_threads read: no ETag, no X-RateLimit-* headers.
        recordApiTelemetry({ kind: "REST", method: "GET", authSource: "GH_TOKEN" });
      });
      recordApiTelemetry({ kind: "REST", method: "POST", authSource: "GH_TOKEN" });
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: "GH_TOKEN",
        notModified: true,
      });

      const usage = summarizeApiTelemetry();
      expect(usage).toEqual({
        credentialSources: ["GH_TOKEN"],
        rest: [
          {
            resource: "core",
            requestCount: 1,
            notModified: 1,
            limit: 5000,
            used: 10,
            remaining: 4990,
            resetAt: 1_700_000_000,
          },
        ],
        unmeteredRestRequestCount: 2,
      });
      expect(formatApiUsage(usage)).toContain(
        "- REST requests without rate-limit headers (unmetered): 2",
      );
    });
  });

  it("does not count a metered response that only lacks a resource name", async () => {
    await withApiTelemetryScope(async () => {
      const { resource: _resource, ...unnamed } = core;
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: "GH_TOKEN",
        rateLimit: unnamed,
      });
      expect(summarizeApiTelemetry()).not.toHaveProperty("unmeteredRestRequestCount");
      // A headerless response in the same command stays out of the metered `unknown` group.
      recordApiTelemetry({ kind: "REST", method: "GET", authSource: "GH_TOKEN" });
      const usage = summarizeApiTelemetry();
      expect(usage?.rest).toEqual([
        expect.objectContaining({ resource: "unknown", requestCount: 1 }),
      ]);
      expect(usage?.unmeteredRestRequestCount).toBe(1);
    });
  });

  it("reports an unmetered-only command and omits the field when every request was metered", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({ kind: "REST", method: "GET", authSource: "GH_TOKEN" });
      expect(summarizeApiTelemetry()).toEqual({
        credentialSources: ["GH_TOKEN"],
        unmeteredRestRequestCount: 1,
      });
    });
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({ kind: "REST", method: "GET", authSource: "GH_TOKEN", rateLimit: core });
      const usage = summarizeApiTelemetry();
      expect(usage).not.toHaveProperty("unmeteredRestRequestCount");
      expect(formatApiUsage(usage)).not.toContain("unmetered");
    });
  });
});
