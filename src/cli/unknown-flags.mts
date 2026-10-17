import { EXIT } from "../exit-codes.mts";
import { FLAGS_WITH_VALUES } from "./arg-flags.mts";

const GLOBAL_FLAGS = ["--format", "--transport", "--verbose", "--help", "-h"];

/**
 * Reject flags a subcommand does not accept before its PR target is resolved. Without this, an
 * unknown or removed flag is treated as value-taking and swallows the PR number that follows it,
 * so the command silently targets the branch-inferred PR instead.
 */
export function rejectUnknownFlags(
  args: string[],
  command: string,
  knownFlags: readonly string[],
): boolean {
  const known = new Set([...GLOBAL_FLAGS, ...knownFlags]);
  let unknown: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith("-")) continue;
    if (!known.has(arg.split("=", 1)[0]!)) {
      unknown = arg;
      break;
    }
    // A separate value (`--message -1`) is the flag's argument, not another flag.
    if (FLAGS_WITH_VALUES.has(arg)) i += 1;
  }
  if (unknown === undefined) return false;
  process.stderr.write(`pr-shepherd: ${command}: unknown flag "${unknown}".\n`);
  process.exitCode = EXIT.USAGE;
  return true;
}
