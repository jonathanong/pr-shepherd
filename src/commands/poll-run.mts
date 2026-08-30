import { withApiTelemetryScope } from "../github/api-telemetry.mts";
import type { IterateResult } from "../types.mts";
import { attachApiUsage } from "./iterate/api-usage.mts";

export function withPollApiUsage(
  runCore: () => Promise<IterateResult>,
  preservePersistedWarning: boolean,
): Promise<IterateResult> {
  return withApiTelemetryScope(async () => {
    const result = await runCore();
    return attachApiUsage(result, true, preservePersistedWarning);
  });
}
