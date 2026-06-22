import { parsePrNumber } from "./args.mts";
import { validateDefaultArgs } from "./validate-default-args.mts";
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
  "--quiet-status",
  "--until-terminal",
]);

export function isDefaultPollInvocation(subcommand: string | undefined): boolean {
  if (subcommand === "--help" || subcommand === "-h") return false;
  return (
    subcommand === undefined || parsePrNumber(subcommand) !== null || isDefaultPollFlag(subcommand)
  );
}

export function validateDefaultPollArgs(args: string[]): boolean {
  return validateDefaultArgs(
    args,
    DEFAULT_POLL_FLAGS_WITH_VALUES,
    DEFAULT_POLL_BOOLEAN_FLAGS,
    writeDefaultUsageError,
  );
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
