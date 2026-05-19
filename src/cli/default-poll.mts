import { parsePrNumber } from "./args.mts";
import { USAGE } from "./help.mts";

const DEFAULT_POLL_FLAGS_WITH_VALUES = new Set([
  "--format",
  "--ready-delay",
  "--stall-timeout",
  "--interval",
  "--timeout",
]);

const DEFAULT_POLL_BOOLEAN_FLAGS = new Set([
  "--verbose",
  "--no-auto-mark-ready",
  "--no-auto-cancel-actionable",
]);

export function isDefaultPollInvocation(subcommand: string | undefined): boolean {
  if (subcommand === "--help" || subcommand === "-h") return false;
  return (
    subcommand === undefined ||
    parsePrNumber(subcommand) !== null ||
    isDefaultPollFlag(subcommand)
  );
}

export function validateDefaultPollArgs(args: string[]): boolean {
  let sawPr = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;

    if (DEFAULT_POLL_FLAGS_WITH_VALUES.has(arg)) {
      if (i + 1 >= args.length || args[i + 1]!.startsWith("--")) {
        writeDefaultUsageError(arg);
        return false;
      }
      i += 1;
      continue;
    }

    const inlineFlag = arg.split("=", 1)[0]!;
    if (DEFAULT_POLL_FLAGS_WITH_VALUES.has(inlineFlag)) continue;

    if (DEFAULT_POLL_BOOLEAN_FLAGS.has(arg)) continue;

    if (parsePrNumber(arg) !== null && !sawPr) {
      sawPr = true;
      continue;
    }

    writeDefaultUsageError(arg);
    return false;
  }

  return true;
}

function isDefaultPollFlag(arg: string): boolean {
  const name = arg.split("=", 1)[0]!;
  return DEFAULT_POLL_FLAGS_WITH_VALUES.has(name) || DEFAULT_POLL_BOOLEAN_FLAGS.has(arg);
}

function writeDefaultUsageError(arg: string): void {
  process.stderr.write(`Unknown subcommand: ${arg}\n`);
  process.stderr.write(`${USAGE.top}\n`);
  process.exitCode = 1;
}
