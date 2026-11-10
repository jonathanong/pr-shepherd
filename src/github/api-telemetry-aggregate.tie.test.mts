import { describe, expect, it } from "vitest";
import {
  recordApiTelemetry,
  summarizeApiTelemetry,
  withApiTelemetryScope,
} from "./api-telemetry.mts";

describe("API telemetry quota window ties", () => {
  it("uses highest used when remaining and reset window tie", async () => {
    await withApiTelemetryScope(async () => {
      for (const used of [undefined, 10, undefined, 5]) {
        recordApiTelemetry({
          kind: "GraphQL",
          method: "POST",
          authSource: "token",
          githubApp: false,
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
