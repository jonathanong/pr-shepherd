import { parsePrNumber } from "./args.mts";

/**
 * Validate args for default-dispatch paths (e.g. `pr-shepherd [PR] [flags]`).
 * Returns false when an unexpected token is found; calls onError with the
 * offending arg so callers can print their own usage message.
 */
export function validateDefaultArgs(
  args: string[],
  flagsWithValues: ReadonlySet<string>,
  booleanFlags: ReadonlySet<string>,
  onError: (arg: string) => void,
): boolean {
  let sawPr = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;

    if (flagsWithValues.has(arg)) {
      if (i + 1 >= args.length || args[i + 1]!.startsWith("--")) {
        onError(arg);
        return false;
      }
      i += 1;
      continue;
    }

    const inlineFlag = arg.split("=", 1)[0]!;
    if (flagsWithValues.has(inlineFlag)) continue;

    if (booleanFlags.has(arg)) continue;

    if (parsePrNumber(arg) !== null && !sawPr) {
      sawPr = true;
      continue;
    }

    onError(arg);
    return false;
  }

  return true;
}
