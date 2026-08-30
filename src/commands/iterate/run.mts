import { snapshotApiTelemetry, withApiTelemetryScope } from "../../github/api-telemetry.mts";
import type { IterateCommandOptions, IterateResult } from "../../types.mts";
import { attachApiUsage } from "./api-usage.mts";

export function withIterateApiUsage(
  opts: IterateCommandOptions,
  runCore: () => Promise<IterateResult>,
): Promise<IterateResult> {
  return withApiTelemetryScope(async () => {
    const snapshot = snapshotApiTelemetry();
    const result = await runCore();
    return attachApiUsage(result, snapshot, opts.deferQuotaWarning !== true);
  });
}
