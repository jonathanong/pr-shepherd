import { parsePrNumber } from "./args.mts";

const DEFAULT_ITERATE_FLAGS_WITH_VALUES = new Set([
  "--format",
  "--ready-delay",
  "--cooldown-seconds",
  "--stall-timeout",
]);

const DEFAULT_ITERATE_BOOLEAN_FLAGS = new Set([
  "--verbose",
  "--no-auto-mark-ready",
  "--no-auto-cancel-actionable",
]);

export function isDefaultIterateInvocation(subcommand: string | undefined): boolean {
  return (
    subcommand === undefined ||
    parsePrNumber(subcommand) !== null ||
    isDefaultIterateFlag(subcommand)
  );
}

export function validateDefaultIterateArgs(args: string[]): boolean {
  let sawPr = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;

    if (DEFAULT_ITERATE_FLAGS_WITH_VALUES.has(arg)) {
      if (i + 1 >= args.length || args[i + 1]!.startsWith("--")) {
        writeDefaultUsageError(arg);
        return false;
      }
      i += 1;
      continue;
    }

    const inlineFlag = arg.split("=", 1)[0]!;
    if (DEFAULT_ITERATE_FLAGS_WITH_VALUES.has(inlineFlag)) continue;

    if (DEFAULT_ITERATE_BOOLEAN_FLAGS.has(arg)) continue;

    if (parsePrNumber(arg) !== null && !sawPr) {
      sawPr = true;
      continue;
    }

    writeDefaultUsageError(arg);
    return false;
  }

  return true;
}

function isDefaultIterateFlag(arg: string): boolean {
  const name = arg.split("=", 1)[0]!;
  return DEFAULT_ITERATE_FLAGS_WITH_VALUES.has(name) || DEFAULT_ITERATE_BOOLEAN_FLAGS.has(arg);
}

function writeDefaultUsageError(arg: string): void {
  process.stderr.write(`Unknown subcommand: ${arg}\n`);
  process.stderr.write(
    "Usage: pr-shepherd [PR] [options]\n" +
      "       pr-shepherd <check|resolve|commit-suggestion|iterate|monitor|status|log-file> [options]\n" +
      "       pr-shepherd --version | -v\n",
  );
  process.exitCode = 1;
}
