import type { StackMergeFlag } from "../commands/stack-targets.mts";
import { EXIT } from "../exit-codes.mts";
import { parseCliPrReference, type ParsedPrReference } from "../pr-reference.mts";
import { getFlag, hasFlag } from "./args.mts";

/**
 * The stack merge scope flags: `--merge`, `--merge-ready`, and `--merge-through <ref>` are
 * mutually exclusive. Returns null after printing a usage error.
 */
export function parseStackMerge(
  extra: string[],
): { flag?: StackMergeFlag; through?: ParsedPrReference } | null {
  const through = getFlag(extra, "--merge-through");
  const flags: StackMergeFlag[] = [
    ...(hasFlag(extra, "--merge") ? (["merge"] as const) : []),
    ...(hasFlag(extra, "--merge-ready") ? (["ready"] as const) : []),
    ...(hasFlag(extra, "--merge-through") || through !== null ? (["through"] as const) : []),
  ];
  const fail = (message: string): null => {
    process.stderr.write(`pr-shepherd: stack: ${message}\n`);
    process.exitCode = EXIT.USAGE;
    return null;
  };
  if (flags.length > 1) {
    return fail("--merge, --merge-ready, and --merge-through are mutually exclusive.");
  }
  if (flags[0] !== "through") return flags[0] ? { flag: flags[0] } : {};
  const ref = through === null ? null : parseCliPrReference(through);
  return ref ? { flag: "through", through: ref } : fail("--merge-through requires a PR reference.");
}
