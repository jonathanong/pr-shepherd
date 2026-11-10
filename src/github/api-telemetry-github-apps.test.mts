import { describe, expect, it } from "vitest";
import {
  recordApiTelemetry,
  summarizeApiTelemetry,
  withApiTelemetryScope,
  withGraphqlCredentialFingerprint,
  withRestCoreCredentialFingerprint,
} from "./api-telemetry.mts";

const APP_A = "GitHub App 1 (installation 10)";
const APP_B = "GitHub App 2 (installation 20)";

function gql(remaining: number, limit: number, resetAt: number, cost = 1) {
  return {
    resource: "graphql",
    limit,
    remaining,
    used: limit - remaining,
    resetAt,
    cost,
    nodeCount: 100,
  };
}

function core(remaining: number, limit: number, resetAt: number) {
  return { resource: "core", limit, remaining, used: limit - remaining, resetAt };
}

describe("GitHub App usage accounting", () => {
  it("splits a mixed run so the top level describes only the user's token chain", async () => {
    const usage = await withApiTelemetryScope(async () => {
      recordApiTelemetry({
        kind: "GraphQL",
        method: "BatchPr",
        authSource: "gh auth token",
        credentialFingerprint: "user",
        rateLimit: gql(4000, 5000, 1000, 7),
      });
      recordApiTelemetry({
        kind: "GraphQL",
        method: "Read",
        authSource: APP_A,
        githubApp: true,
        credentialFingerprint: "app-a",
        rateLimit: gql(9997, 10000, 2000, 2),
      });
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: APP_A,
        githubApp: true,
        credentialFingerprint: "app-a",
        rateLimit: core(14999, 15000, 2000),
      });
      return summarizeApiTelemetry();
    });

    expect(usage).toEqual({
      credentialSources: ["gh auth token"],
      graphql: {
        resource: "graphql",
        requestCount: 1,
        limit: 5000,
        used: 1000,
        remaining: 4000,
        resetAt: 1000,
        measuredQueryCost: 7,
        unmeasuredRequestCount: 0,
        nodeCount: 100,
      },
      githubApps: [
        {
          source: APP_A,
          graphql: {
            resource: "graphql",
            requestCount: 1,
            limit: 10000,
            used: 3,
            remaining: 9997,
            resetAt: 2000,
            measuredQueryCost: 2,
            unmeasuredRequestCount: 0,
            nodeCount: 100,
          },
          rest: [
            {
              resource: "core",
              requestCount: 1,
              limit: 15000,
              used: 1,
              remaining: 14999,
              resetAt: 2000,
            },
          ],
        },
      ],
    });
  });

  it("keeps app-only resources off the user chain and orders installations by first use", async () => {
    const usage = await withApiTelemetryScope(async () => {
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: APP_B,
        githubApp: true,
        rateLimit: core(10, 20, 5),
      });
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: APP_A,
        githubApp: true,
        rateLimit: core(30, 40, 6),
      });
      await withApiTelemetryScope(async () => {
        recordApiTelemetry({ kind: "REST", method: "GET", authSource: APP_B, githubApp: true });
      });
      return summarizeApiTelemetry();
    });

    expect(usage?.credentialSources).toEqual([]);
    expect(usage).not.toHaveProperty("graphql");
    expect(usage).not.toHaveProperty("rest");
    expect(usage?.githubApps?.map((app) => app.source)).toEqual([APP_B, APP_A]);
    expect(usage?.githubApps?.[0]?.rest?.[0]).toMatchObject({ requestCount: 1, remaining: 10 });
    expect(usage?.githubApps?.[1]?.rest?.[0]).toMatchObject({ remaining: 30 });
  });

  it("omits githubApps when no app answered", async () => {
    const usage = await withApiTelemetryScope(async () => {
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: "GH_TOKEN",
        rateLimit: core(1, 2, 3),
      });
      return summarizeApiTelemetry();
    });
    expect(usage).not.toHaveProperty("githubApps");
  });

  it("drives quota fingerprints from user samples even when the app's reset is later", async () => {
    await withApiTelemetryScope(async () => {
      for (const [kind, sample] of [
        ["GraphQL", gql(10, 5000, 1000)],
        ["REST", core(10, 5000, 1000)],
      ] as const) {
        recordApiTelemetry({
          kind,
          method: "x",
          authSource: "GH_TOKEN",
          credentialFingerprint: "user",
          rateLimit: sample,
        });
      }
      for (const [kind, sample] of [
        ["GraphQL", gql(9000, 10000, 9999)],
        ["REST", core(9000, 10000, 9999)],
      ] as const) {
        recordApiTelemetry({
          kind,
          method: "x",
          authSource: APP_A,
          githubApp: true,
          credentialFingerprint: "app",
          rateLimit: sample,
        });
      }
      expect(withGraphqlCredentialFingerprint({})).toEqual({ credentialFingerprint: "user" });
      expect(withRestCoreCredentialFingerprint({})).toEqual({ credentialFingerprint: "user" });
      expect(summarizeApiTelemetry()?.graphql?.remaining).toBe(10);
      expect(summarizeApiTelemetry()?.rest?.[0]?.remaining).toBe(10);
    });
  });

  it("leaves the user-side sample absent when only the app answered", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({
        kind: "GraphQL",
        method: "Read",
        authSource: APP_A,
        githubApp: true,
        credentialFingerprint: "app",
        rateLimit: gql(9000, 10000, 9999),
      });
      expect(withGraphqlCredentialFingerprint({})).toEqual({});
      expect(summarizeApiTelemetry()?.graphql).toBeUndefined();
    });
  });
});
