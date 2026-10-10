import { describe, expect, it, vi } from "vitest";
import {
  recordApiTelemetry,
  summarizeApiTelemetry,
  withApiTelemetryScope,
} from "../github/api-telemetry.mts";

const { evaluateWarning } = vi.hoisted(() => ({ evaluateWarning: vi.fn() }));
vi.mock("../state/graphql-quota-warnings.mts", () => ({
  evaluateWorktreeGraphqlQuotaWarning: evaluateWarning,
}));

import { selectQuotaWarning } from "./quota-selection.mts";

describe("quota warning sample provenance", () => {
  it("keeps the core snapshot's credential when telemetry rotates during GraphQL warning persistence", async () => {
    await withApiTelemetryScope(async () => {
      recordApiTelemetry({
        kind: "GraphQL",
        method: "POST",
        authSource: "GH_TOKEN",
        credentialFingerprint: "g".repeat(16),
        rateLimit: { resource: "graphql", limit: 5000, remaining: 4000, resetAt: 1_700_000_000 },
      });
      recordApiTelemetry({
        kind: "REST",
        method: "GET",
        authSource: "GH_TOKEN",
        credentialFingerprint: "a".repeat(16),
        rateLimit: { resource: "core", limit: 5000, remaining: 1000, resetAt: 1_700_000_000 },
      });
      const usage = summarizeApiTelemetry()!;
      evaluateWarning.mockImplementation(async (_key, _bands, sample) => {
        if (sample.resource === "graphql") {
          recordApiTelemetry({
            kind: "REST",
            method: "GET",
            authSource: "GH_TOKEN",
            credentialFingerprint: "b".repeat(16),
            rateLimit: { resource: "core", limit: 5000, remaining: 4900, resetAt: 1_700_000_000 },
          });
        }
        return undefined;
      });

      await selectQuotaWarning(
        { owner: "acme", repo: "widgets" },
        [{ remainingPercent: 30, pollIntervalMinutes: 2 }],
        usage,
        true,
        "graphql",
      );

      expect(evaluateWarning.mock.calls.map(([, , sample]) => sample)).toMatchObject([
        { resource: "graphql", remaining: 4000, credentialFingerprint: "g".repeat(16) },
        { resource: "core", remaining: 1000, credentialFingerprint: "a".repeat(16) },
      ]);
    });
  });
});
