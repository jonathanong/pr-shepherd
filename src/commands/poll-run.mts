import { snapshotApiTelemetry, withApiTelemetryScope } from "../github/api-telemetry.mts";
import type { IterateResult } from "../types.mts";
import { attachApiUsage } from "./iterate/api-usage.mts";

export function withPollApiUsage(runCore: () => Promise<IterateResult>): Promise<IterateResult> {
  return withApiTelemetryScope(async () => {
    const apiSnapshot = snapshotApiTelemetry();
    const result = await runCore();
    return attachApiUsage(result, apiSnapshot, true);
  });
}
