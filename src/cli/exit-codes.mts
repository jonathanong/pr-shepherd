import { loadConfig } from "../config/load.mts";
import type { ShepherdAction } from "../types.mts";

const SECOND_DURATION_UNITS = new Set([
  "s",
  "sec",
  "second",
  "seconds",
  "m",
  "min",
  "minute",
  "minutes",
  "h",
  "hour",
  "hours",
]);

interface SecondsDurationParts {
  value: number;
  unit: string;
}

export function parseDurationToMinutes(s: string, defaultMinutes?: number): number {
  const m = /^(\d+)(m|min|minutes?|h|hours?)?$/.exec(s.trim());
  if (!m) return defaultMinutes ?? loadConfig().watch.readyDelayMinutes;
  const n = parseInt(m[1]!, 10);
  const unit = m[2] ?? "m";
  if (unit.startsWith("h")) return n * 60;
  return n;
}

export function parseSecondsDurationParts(s: string): SecondsDurationParts | null {
  const trimmed = s.trim();
  const match = /^(\d+(?:\.\d+)?)([a-z]+)?$/.exec(trimmed);
  if (!match) return null;

  const amount = match[1];
  const explicitUnit = match[2];
  if (!amount || (amount.includes(".") && !explicitUnit)) return null;

  const unit = explicitUnit ?? "s";
  if (!SECOND_DURATION_UNITS.has(unit)) return null;

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;

  return { value, unit };
}

export function parseDurationToSeconds(s: string, defaultSeconds: number): number {
  const parsed = parseSecondsDurationParts(s);
  if (!parsed) return defaultSeconds;
  if (parsed.unit.startsWith("h")) return parsed.value * 3600;
  if (parsed.unit.startsWith("m")) return parsed.value * 60;
  return parsed.value;
}

export function statusToExitCode(status: string): number {
  switch (status) {
    case "MERGED":
    case "CLOSED":
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
