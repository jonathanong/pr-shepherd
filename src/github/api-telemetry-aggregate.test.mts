import { describe, expect, it } from "vitest";
import {
  recordApiTelemetry,
  summarizeApiTelemetry,
  withApiTelemetryScope,
} from "./api-telemetry.mts";

describe("API telemetry bounded aggregation", () => {
  it("keeps the strongest observation in the newest GraphQL quota window", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({
        kind: "GraphQL",
        method: "POST",
        authSource: "token",
        rateLimit: {
          resource: "graphql",
          limit: 5000,
          used: 100,
          remaining: 4900,
          resetAt: 1_700_000_000,
        },
      });
      // Responses can complete out of order. The newer reset window wins,
      // and within that window the lowest remaining value is authoritative.
      recordApiTelemetry({
        kind: "GraphQL",
        method: "POST",
        authSource: "token",
        rateLimit: {
          resource: "graphql",
          limit: 5000,
          used: 200,
          remaining: 4800,
          resetAt: 1_700_000_100,
        },
      });
      recordApiTelemetry({
        kind: "GraphQL",
        method: "POST",
        authSource: "token",
        rateLimit: {
          resource: "graphql",
          limit: 5000,
          used: 250,
          remaining: 4750,
          resetAt: 1_700_000_100,
        },
      });

      expect(summarizeApiTelemetry()).toMatchObject({
        graphql: { used: 250, remaining: 4750, resetAt: 1_700_000_100 },
      });
    });
  });

  it("folds nested scope totals into the parent scope", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({ kind: "GraphQL", method: "POST", authSource: "token" });
      await withApiTelemetryScope(async () => {
        recordApiTelemetry({
          kind: "GraphQL",
          method: "POST",
          authSource: "nested-token",
          rateLimit: {
            resource: "graphql",
            limit: 5000,
            used: 2,
            remaining: 4998,
            resetAt: 1_700_000_000,
            cost: 3,
            nodeCount: 4,
          },
        });
      });

      expect(summarizeApiTelemetry()).toEqual({
        credentialSources: ["token", "nested-token"],
        graphql: {
          resource: "graphql",
          requestCount: 2,
          limit: 5000,
          used: 2,
          remaining: 4998,
          resetAt: 1_700_000_000,
          measuredQueryCost: 3,
          unmeasuredRequestCount: 1,
          nodeCount: 4,
        },
      });
    });
  });

  it("keeps child telemetry isolated while the child is running", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({ kind: "REST", method: "GET", authSource: "token" });
      await withApiTelemetryScope(async () => {
        recordApiTelemetry({ kind: "GraphQL", method: "POST", authSource: "child" });
        expect(summarizeApiTelemetry()).toEqual({ credentialSources: ["child"] });
      });

      expect(summarizeApiTelemetry()).toEqual({ credentialSources: ["token", "child"] });
    });
  });

  it("keeps the newest REST observation when parent and child scopes overlap", async () => {
    await withApiTelemetryScope(async () => {
      let releaseChild!: () => void;
      const childCanFinish = new Promise<void>((resolve) => {
        releaseChild = resolve;
      });
      let childRecorded!: () => void;
      const childDidRecord = new Promise<void>((resolve) => {
        childRecorded = resolve;
      });
      const child = withApiTelemetryScope(async () => {
        recordApiTelemetry({
          kind: "REST",
          method: "GET",
          authSource: "token",
          rateLimit: {
            resource: "core",
            limit: 5000,
            remaining: 4900,
            resetAt: 1_700_000_000,
          },
        });
        childRecorded();
        await childCanFinish;
      });
      await childDidRecord;
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: "token",
        rateLimit: {
          resource: "core",
          limit: 5000,
          remaining: 4800,
          resetAt: 1_700_000_000,
        },
      });
      releaseChild();
      await child;

      expect(summarizeApiTelemetry()).toMatchObject({
        rest: [{ resource: "core", requestCount: 2, remaining: 4800 }],
      });
    });
  });

  it("uses highest used when remaining and reset window tie", async () => {
    await withApiTelemetryScope(async () => {
      for (const used of [undefined, 10, undefined, 5]) {
        recordApiTelemetry({
          kind: "GraphQL",
          method: "POST",
          authSource: "token",
          rateLimit: {
            resource: "graphql",
            limit: 5000,
            ...(used !== undefined && { used }),
            remaining: 4990,
            resetAt: 1_700_000_000,
          },
        });
      }

      expect(summarizeApiTelemetry()).toMatchObject({ graphql: { used: 10, remaining: 4990 } });
    });
  });
});
