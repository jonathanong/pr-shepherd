import { EXIT } from "../exit-codes.mts";

/** Flags removed in v1, with the replacement each usage error names. */
const REMOVED_FLAGS: ReadonlyMap<string, string> = new Map([
  ["--stack", "`--stack` was removed; use `pr-shepherd stack <PR>`."],
  [
    "--poll-mode",
    "`--poll-mode` was removed; `pr-shepherd iterate` runs one tick, and looping commands run one tick when CLAUDE_CODE_REMOTE=true.",
  ],
]);

export function isRemovedFlag(arg: string): boolean {
  return REMOVED_FLAGS.has(arg.split("=", 1)[0]!);
}

/** Prints a usage error and returns true when `args` contains a removed flag. */
export function rejectRemovedFlags(args: string[]): boolean {
  for (const arg of args) {
    const message = REMOVED_FLAGS.get(arg.split("=", 1)[0]!);
    if (message === undefined) continue;
    process.stderr.write(`pr-shepherd: ${message}\n`);
    process.exitCode = EXIT.USAGE;
    return true;
  }
  return false;
}
