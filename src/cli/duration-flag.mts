import { EXIT } from "../exit-codes.mts";
import type { DurationParseOptions } from "./duration.mts";
import { parseSecondsDurationParts } from "./duration.mts";

export function validateSecondsDurationFlag(
  command: string,
  flag: string,
  value: string | null,
  presentAsSeparateArg: boolean,
  opts: DurationParseOptions = {},
): string | undefined | null {
  const bareUnit = opts.defaultUnit === "m" ? "minutes" : "seconds";
  const example = opts.defaultUnit === "m" ? "15m" : "30s";
  if (value === null) {
    if (presentAsSeparateArg) {
      process.stderr.write(`${command}: ${flag} requires a value (e.g. ${flag} ${example})\n`);
      process.exitCode = EXIT.USAGE;
      return null;
    }
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("--")) {
    process.stderr.write(`${command}: ${flag} requires a value (e.g. ${flag} ${example})\n`);
    process.exitCode = EXIT.USAGE;
    return null;
  }
  if (!parseSecondsDurationParts(trimmed, opts)) {
    process.stderr.write(
      `${command}: invalid ${flag}: ${value}. Expected a duration like 30s, 4.5m, 1h, or a bare number (${bareUnit}).\n`,
    );
    process.exitCode = EXIT.USAGE;
    return null;
  }
  return trimmed;
}
