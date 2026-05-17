import { hasFlag } from "./args.mts";
import { COMMAND_USAGE } from "./help-command-pages.mts";
import { TOP_USAGE } from "./help-top-page.mts";

export const USAGE = {
  top: TOP_USAGE,
  ...COMMAND_USAGE,
} as const;

/** Prints usage for `key` to stdout and returns true if `--help` or `-h` is in args. */
export function maybePrintHelp(args: string[], key: keyof typeof USAGE): boolean {
  if (!hasFlag(args, "--help") && !hasFlag(args, "-h")) return false;
  process.stdout.write(`${USAGE[key]}\n`);
  return true;
}
