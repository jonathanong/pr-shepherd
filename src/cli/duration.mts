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

export interface DurationParseOptions {
  /** Unit assumed for a bare number with no suffix. Defaults to seconds. */
  defaultUnit?: "s" | "m";
  /** When true, 0 is accepted (used by flags where 0 means "disabled"). */
  allowZero?: boolean;
}

export function parseSecondsDurationParts(
  s: string,
  opts: DurationParseOptions = {},
): SecondsDurationParts | null {
  const trimmed = s.trim();
  const match = /^(\d+(?:\.\d+)?)([a-z]+)?$/.exec(trimmed);
  if (!match) return null;

  const amount = match[1];
  const explicitUnit = match[2];
  if (!amount || (amount.includes(".") && !explicitUnit)) return null;

  const unit = explicitUnit ?? opts.defaultUnit ?? "s";
  if (!SECOND_DURATION_UNITS.has(unit)) return null;

  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  if (opts.allowZero ? value < 0 : value <= 0) return null;

  return { value, unit };
}

export function parseDurationToSeconds(
  s: string,
  defaultSeconds: number,
  opts: DurationParseOptions = {},
): number {
  const parsed = parseSecondsDurationParts(s, opts);
  if (!parsed) return defaultSeconds;
  if (parsed.unit.startsWith("h")) return parsed.value * 3600;
  if (parsed.unit.startsWith("m")) return parsed.value * 60;
  return parsed.value;
}
