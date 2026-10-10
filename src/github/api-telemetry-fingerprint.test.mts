import { describe, expect, it } from "vitest";
import {
  recordApiTelemetry,
  summarizeApiTelemetry,
  withApiTelemetryScope,
  withGraphqlCredentialFingerprint,
  withRestCoreCredentialFingerprint,
} from "./api-telemetry.mts";

describe("GraphQL credential fingerprint", () => {
  it("is absent outside a telemetry scope", () => {
    expect(withGraphqlCredentialFingerprint({ remaining: 1 })).toEqual({ remaining: 1 });
    expect(withRestCoreCredentialFingerprint({ remaining: 1 })).toEqual({ remaining: 1 });
  });

  it("follows the authoritative sample and stays off summarized usage", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({
        kind: "GraphQL",
        method: "POST",
        authSource: "token",
        credentialFingerprint: "b".repeat(16),
        rateLimit: {
          resource: "graphql",
          limit: 5000,
          used: 3800,
          remaining: 1200,
          resetAt: 1_700_000_000,
        },
      });
      recordApiTelemetry({
        kind: "GraphQL",
        method: "POST",
        authSource: "token",
        credentialFingerprint: "a".repeat(16),
        rateLimit: {
          resource: "graphql",
          limit: 5000,
          used: 3790,
          remaining: 1210,
          resetAt: 1_700_000_000,
        },
      });

      expect(withGraphqlCredentialFingerprint({ remaining: 1200 })).toEqual({
        remaining: 1200,
        credentialFingerprint: "b".repeat(16),
      });
      expect(summarizeApiTelemetry()?.graphql).not.toHaveProperty("credentialFingerprint");
    });
  });

  it("keeps a nested scope's fingerprint after it is folded into the parent", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({ kind: "GraphQL", method: "POST", authSource: "token" });
      await withApiTelemetryScope(async () => {
        recordApiTelemetry({
          kind: "GraphQL",
          method: "POST",
          authSource: "nested-token",
          credentialFingerprint: "c".repeat(16),
          rateLimit: {
            resource: "graphql",
            limit: 5000,
            used: 2,
            remaining: 4998,
            resetAt: 1_700_000_000,
          },
        });
      });
      expect(withGraphqlCredentialFingerprint({ remaining: 4998 })).toMatchObject({
        credentialFingerprint: "c".repeat(16),
      });
    });
  });

  it("tracks REST core credential switches independently from GraphQL", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({
        kind: "GraphQL",
        method: "POST",
        authSource: "graphql-token",
        credentialFingerprint: "g".repeat(16),
        rateLimit: {
          resource: "graphql",
          limit: 5000,
          used: 4900,
          remaining: 100,
          resetAt: 1_700_000_000,
        },
      });
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: "rest-token-a",
        credentialFingerprint: "a".repeat(16),
        rateLimit: {
          resource: "core",
          limit: 5000,
          used: 4500,
          remaining: 500,
          resetAt: 1_700_000_000,
        },
      });
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: "rest-token-b",
        credentialFingerprint: "b".repeat(16),
        rateLimit: {
          resource: "core",
          limit: 5000,
          used: 100,
          remaining: 4900,
          resetAt: 1_700_000_000,
        },
      });

      expect(withRestCoreCredentialFingerprint({ remaining: 4900 })).toEqual({
        remaining: 4900,
        credentialFingerprint: "b".repeat(16),
      });
      expect(withGraphqlCredentialFingerprint({ remaining: 100 })).toMatchObject({
        credentialFingerprint: "g".repeat(16),
      });
      expect(summarizeApiTelemetry()?.rest?.[0]).not.toHaveProperty("credentialFingerprint");
    });
  });

  it("preserves REST core credential provenance through nested scope compaction", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: "old-token",
        credentialFingerprint: "a".repeat(16),
        rateLimit: {
          resource: "core",
          limit: 5000,
          used: 4500,
          remaining: 500,
          resetAt: 1_700_000_000,
        },
      });
      await withApiTelemetryScope(async () => {
        recordApiTelemetry({
          kind: "REST",
          method: "GET",
          authSource: "new-token",
          credentialFingerprint: "b".repeat(16),
          rateLimit: {
            resource: "core",
            limit: 5000,
            used: 100,
            remaining: 4900,
            resetAt: 1_700_000_000,
          },
        });
      });
      expect(withRestCoreCredentialFingerprint({ remaining: 4900 })).toMatchObject({
        credentialFingerprint: "b".repeat(16),
      });
    });
  });
});
