import { loadConfig } from "../config/load.mts";
import { deriveVerdict } from "../commands/status.mts";
import type { ShepherdAction } from "../types.mts";
import type { PrSummary } from "../commands/status.mts";

export function parseDurationToMinutes(s: string, defaultMinutes?: number): number {
  const m = /^(\d+)(m|min|minutes?|h|hours?)?$/.exec(s.trim());
  if (!m) return defaultMinutes ?? loadConfig().watch.readyDelayMinutes;
  const n = parseInt(m[1]!, 10);
  const unit = m[2] ?? "m";
  if (unit.startsWith("h")) return n * 60;
  return n;
}

export function statusToExitCode(status: string): number {
  switch (status) {
    case "READY":
      return 0;
    case "IN_PROGRESS":
      return 2;
    case "UNRESOLVED_COMMENTS":
      return 3;
    default:
      return 1;
  }
}

export function iterateActionToExitCode(action: ShepherdAction): number {
  switch (action) {
    case "fix_code":
      return 1;
    case "cancel":
      return 2;
    case "escalate":
      return 3;
    default:
      return 0;
  }
}

export function deriveSimpleReady(s: PrSummary): boolean {
  return deriveVerdict(s) === "READY";
}
