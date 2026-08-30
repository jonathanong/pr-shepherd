import { describe, expect, it } from "vitest";
import {
  mergeGraphqlRateLimit,
  recordApiTelemetry,
  summarizeApiTelemetry,
  withApiTelemetryScope,
} from "./api-telemetry.mts";

describe("API telemetry aggregation", () => {
  it("aggregates exact GraphQL query cost and reports unmeasured mutations", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({
        kind: "GraphQL",
        method: "POST",
        authSource: "gh auth token",
        rateLimit: {
          resource: "graphql",
          limit: 5000,
          used: 100,
          remaining: 4900,
          resetAt: 1_700_000_000,
          cost: 7,
          nodeCount: 23,
        },
      });
      recordApiTelemetry({
        kind: "GraphQL",
        method: "POST",
        authSource: "gh auth token",
        rateLimit: {
          resource: "graphql",
          limit: 5000,
          used: 105,
          remaining: 4895,
          resetAt: 1_700_000_000,
        },
      });

      expect(summarizeApiTelemetry()).toEqual({
        credentialSources: ["gh auth token"],
        graphql: {
          resource: "graphql",
          requestCount: 2,
          measuredQueryCost: 7,
          unmeasuredRequestCount: 1,
          nodeCount: 23,
          limit: 5000,
          used: 105,
          remaining: 4895,
          resetAt: 1_700_000_000,
        },
      });
    });
  });

  it("groups REST requests by their raw rate-limit resource", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: "GH_TOKEN",
        rateLimit: {
          resource: "core",
          limit: 5000,
          used: 2,
          remaining: 4998,
          resetAt: 1_700_000_100,
        },
      });

      expect(summarizeApiTelemetry()).toMatchObject({
        credentialSources: ["GH_TOKEN"],
        rest: [
          {
            resource: "core",
            requestCount: 1,
            limit: 5000,
            used: 2,
            remaining: 4998,
            resetAt: 1_700_000_100,
          },
        ],
      });
    });
  });

  it("discards events outside an explicit command scope", () => {
    recordApiTelemetry({ kind: "REST", method: "GET", authSource: "GH_TOKEN" });
    expect(summarizeApiTelemetry()).toBeUndefined();
  });

  it("isolates concurrent command scopes", async () => {
    const summarize = (source: string) =>
      withApiTelemetryScope(async () => {
        await Promise.resolve();
        recordApiTelemetry({ kind: "GraphQL", method: "POST", authSource: source });
        await Promise.resolve();
        return summarizeApiTelemetry();
      });

    const [left, right] = await Promise.all([summarize("left"), summarize("right")]);
    expect(left?.credentialSources).toEqual(["left"]);
    expect(right?.credentialSources).toEqual(["right"]);
  });
  it("ignores malformed GraphQL rate-limit payloads", () => {
    expect(
      mergeGraphqlRateLimit(null, {
        _shepherdRateLimit: {
          cost: 1,
          limit: 5000,
          nodeCount: 1,
          remaining: 4999,
          resetAt: "2026-08-30T06:00:00Z",
        },
      }),
    ).toBeNull();
  });
});
