import { hasFlag } from "./args.mts";
import { COMMAND_USAGE } from "./help-command-pages.mts";
import { TOP_USAGE } from "./help-top-page.mts";

export const USAGE = {
  top: TOP_USAGE,
  ...COMMAND_USAGE,
} as const;

/** Resolve help keys for nested public commands before any command I/O. */
export function helpKeyForArgs(args: string[]): keyof typeof USAGE {
  if (args[0] === "apply" && args[1] === "review") return "apply review";
  if (args[0] === "apply" && args[1] === "files") return "apply files";
  if (args[0] === "apply" && args[1] === "journal") return "apply journal";
  if (args[0] === "journal" && args[1] === "extract") return "journal extract";
  if (args[0] === "admin" && args[1] === "clean") return "admin clean";
  if (args[0] === "admin" && args[1] === "log-file") return "admin log-file";
  if (args[0] != null && (args[0] as string) in USAGE) {
    return args[0] as keyof typeof USAGE;
  }
  return "top";
}

/** Prints usage for `key` to stdout and returns true if `--help` or `-h` is in args. */
export function maybePrintHelp(args: string[], key: keyof typeof USAGE): boolean {
  if (!hasFlag(args, "--help") && !hasFlag(args, "-h")) return false;
  process.stdout.write(`${USAGE[key]}\n`);
  return true;
}
