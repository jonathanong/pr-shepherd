import { describe, expect, it } from "vitest";
import {
  recordApiTelemetry,
  summarizeApiTelemetry,
  withApiTelemetryScope,
  withRestCoreCredentialFingerprint,
} from "./api-telemetry.mts";

function sample(fingerprint: string, remaining: number) {
  recordApiTelemetry({
    kind: "REST",
    method: "GET",
    authSource: "GH_TOKEN",
    credentialFingerprint: fingerprint.repeat(16),
    rateLimit: {
      resource: "core",
      limit: 5000,
      remaining,
      used: 5000 - remaining,
      resetAt: 1_700_000_000,
    },
  });
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("REST quota provenance during interleaved telemetry compaction", () => {
  it("uses the latest credential observation even when its quota is unchanged", async () => {
    await withApiTelemetryScope(async () => {
      sample("b", 400);
      const gate = deferred();
      const child = withApiTelemetryScope(async () => {
        sample("a", 500);
        await gate.promise;
      });
      sample("b", 400);
      gate.release();
      await child;

      expect(summarizeApiTelemetry()?.rest).toMatchObject([
        { resource: "core", requestCount: 3, remaining: 400 },
      ]);
      expect(withRestCoreCredentialFingerprint({ resource: "core" })).toMatchObject({
        credentialFingerprint: "b".repeat(16),
      });
    });
  });

  it("preserves the conservative quota from the same credential across out-of-order completion", async () => {
    await withApiTelemetryScope(async () => {
      const gate = deferred();
      const child = withApiTelemetryScope(async () => {
        sample("a", 500);
        await gate.promise;
      });
      sample("a", 4900);
      gate.release();
      await child;

      expect(summarizeApiTelemetry()?.rest).toMatchObject([
        { resource: "core", requestCount: 2, remaining: 500 },
      ]);
      expect(withRestCoreCredentialFingerprint({ resource: "core" })).toMatchObject({
        credentialFingerprint: "a".repeat(16),
      });
    });
  });

  it("keeps a later parent credential when an older child sample finishes afterwards", async () => {
    await withApiTelemetryScope(async () => {
      sample("a", 500);
      const gate = deferred();
      const child = withApiTelemetryScope(async () => {
        sample("a", 400);
        await gate.promise;
      });
      sample("b", 4900);
      gate.release();
      await child;

      expect(summarizeApiTelemetry()?.rest).toMatchObject([
        { resource: "core", requestCount: 3, remaining: 4900 },
      ]);
      expect(withRestCoreCredentialFingerprint({ resource: "core" })).toMatchObject({
        credentialFingerprint: "b".repeat(16),
      });
    });
  });

  it("keeps the later sibling credential when scopes complete out of order", async () => {
    await withApiTelemetryScope(async () => {
      const gate = deferred();
      const older = withApiTelemetryScope(async () => {
        sample("a", 500);
        await gate.promise;
      });
      await withApiTelemetryScope(async () => {
        sample("b", 4900);
      });
      gate.release();
      await older;

      expect(summarizeApiTelemetry()?.rest).toMatchObject([
        { resource: "core", requestCount: 2, remaining: 4900 },
      ]);
      expect(withRestCoreCredentialFingerprint({ resource: "core" })).toMatchObject({
        credentialFingerprint: "b".repeat(16),
      });
    });
  });
});
