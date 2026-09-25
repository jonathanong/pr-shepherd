import { EXIT, errorToExitCode } from "../exit-codes.mts";
import { applyCheckBlocker, formatCheckBlockerResult } from "../commands/apply-check-blocker.mts";
import { parseBlockedByRef } from "../commands/check-blocker-ref.mts";
import type { CheckBlockerRef } from "../state/check-blockers.mts";
import { getFlag, hasFlag, parseCommonArgs } from "./args.mts";
import { maybePrintHelp } from "./help.mts";

/** `apply check-blocker`. `--help`/`-h` returns before flag validation or state I/O. */
export async function handleCheckBlocker(args: string[]): Promise<void> {
  if (maybePrintHelp(args, "apply check-blocker")) return;
  const { prNumber, global, extra } = parseCommonArgs(args);
  const flagError = validateFlags(extra);
  if (flagError) {
    usage(flagError);
    return;
  }
  const checkName = getFlag(extra, "--check");
  const blockedBy = getFlag(extra, "--blocked-by");
  const clear = hasFlag(extra, "--clear");
  if (checkName === null || checkName.length === 0) {
    usage("`--check` requires the exact check name.");
    return;
  }
  if (clear && blockedBy !== null) {
    usage("pass either `--blocked-by` or `--clear`, not both.");
    return;
  }
  if (!clear && blockedBy === null) {
    usage("pass `--blocked-by <ref>` or `--clear`.");
    return;
  }
  let blocker: CheckBlockerRef | undefined;
  if (!clear) {
    blocker = parseBlockedByRef(blockedBy ?? "") ?? undefined;
    if (!blocker) {
      usage(`invalid --blocked-by reference: "${blockedBy}".`);
      return;
    }
  }
  try {
    const result = await applyCheckBlocker({
      prNumber,
      targetRepository: global.targetRepository,
      checkName,
      ...(clear ? { clear: true as const } : { blocker: blocker! }),
    });
    const body =
      global.format === "json" ? JSON.stringify(result, null, 2) : formatCheckBlockerResult(result);
    process.stdout.write(`${body}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`pr-shepherd: apply check-blocker: ${message}\n`);
    process.exitCode = errorToExitCode(err);
  }
}

function usage(message: string): void {
  process.stderr.write(`pr-shepherd: apply check-blocker: ${message}\n`);
  process.exitCode = EXIT.USAGE;
}

function validateFlags(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) return `unexpected argument: "${arg}"`;
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    if (name !== "--check" && name !== "--blocked-by" && name !== "--clear") {
      return `unknown flag: "${name}"`;
    }
    if (name === "--clear") {
      if (eq !== -1) return `unknown flag: "${arg}"`;
      continue;
    }
    if (eq === -1) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) return `${name} requires a value.`;
      i += 1;
    }
  }
  return null;
}
