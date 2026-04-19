/**
 * Pure CLI argument-parsing helpers extracted from cli.mts for testability.
 */

import { loadConfig } from "../config/load.mts";
import type { GlobalOptions, ShepherdAction } from "../types.mts";
import type { PrSummary } from "../commands/status.mts";

// ---------------------------------------------------------------------------
// Common arg parsing
// ---------------------------------------------------------------------------

export interface ParsedArgs {
  prNumber: number | undefined;
  global: GlobalOptions;
  extra: string[];
}

export function parseCommonArgs(args: string[]): ParsedArgs {
  const config = loadConfig();
  const format = (getFlag(args, "--format") ?? "text") as "text" | "json";
  const noCache = hasFlag(args, "--no-cache");
  const cacheTtlStr = getFlag(args, "--cache-ttl");
  const cacheTtlSeconds = cacheTtlStr ? parseInt(cacheTtlStr, 10) : config.cache.ttlSeconds;

  // All flags that take a value — used only to prevent their numeric values
  // from being mistaken as the PR number.
  const allFlagsWithValues = new Set([
    "--format",
    "--cache-ttl",
    "--last-push-time",
    "--ready-delay",
    "--cooldown-seconds",
    "--require-sha",
    "--message",
  ]);
  // Only global flags are stripped from `extra`; subcommand-specific flags
  // must remain so handlers like handleIterate/handleResolve can read them.
  const globalFlagsWithValues = new Set(["--format", "--cache-ttl"]);

  const skipForPrDetect = new Set<number>(); // indices to skip when finding PR number
  const excludeFromExtra = new Set<number>(); // indices to strip from extra (global only)

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--no-cache") {
      skipForPrDetect.add(i);
      excludeFromExtra.add(i);
    } else if (globalFlagsWithValues.has(arg)) {
      skipForPrDetect.add(i);
      excludeFromExtra.add(i);
      if (i + 1 < args.length) {
        skipForPrDetect.add(i + 1);
        excludeFromExtra.add(i + 1);
      }
      i += 1;
    } else if (allFlagsWithValues.has(arg)) {
      skipForPrDetect.add(i);
      if (i + 1 < args.length) skipForPrDetect.add(i + 1);
      i += 1;
    } else if ([...allFlagsWithValues].some((f) => arg.startsWith(`${f}=`))) {
      skipForPrDetect.add(i);
    }
  }

  // First non-skipped positional arg that looks like a PR number.
  const prArg = args.find(
    (a, index) => !skipForPrDetect.has(index) && !a.startsWith("--") && /^\d+$/.test(a),
  );
  const prNumber = prArg ? parseInt(prArg, 10) : undefined;

  // Only strip global flags from extra — subcommand flags are passed through.
  const extra = args.filter((_, index) => !excludeFromExtra.has(index));

  return {
    prNumber,
    global: { format, noCache, cacheTtlSeconds },
    extra,
  };
}

/** Get the value of a flag like `--flag value` or `--flag=value`. */
export function getFlag(args: string[], name: string): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === name && i + 1 < args.length) return args[i + 1]!;
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return null;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseStatusPrNumbers(args: string[]): number[] {
  const flagsWithValues = new Set(["--format", "--cache-ttl"]);
  const prNumbers: number[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (flagsWithValues.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) continue;
    const n = parseInt(arg, 10);
    if (Number.isFinite(n)) prNumbers.push(n);
  }
  return prNumbers;
}

// ---------------------------------------------------------------------------
// Duration parsing
// ---------------------------------------------------------------------------

export function parseDurationToMinutes(s: string): number {
  const config = loadConfig();
  const m = /^(\d+)(m|min|minutes?|h|hours?)?$/.exec(s.trim());
  if (!m) return config.watch.readyDelayMinutes;
  const n = parseInt(m[1]!, 10);
  const unit = m[2] ?? "m";
  if (unit.startsWith("h")) return n * 60;
  return n;
}

// ---------------------------------------------------------------------------
// Exit code mapping
// ---------------------------------------------------------------------------

export function statusToExitCode(status: string): number {
  switch (status) {
    case "READY":
      return 0;
    case "IN_PROGRESS":
      return 2;
    case "UNRESOLVED_COMMENTS":
      return 3;
    default:
      return 1;
  }
}

export function iterateActionToExitCode(action: ShepherdAction): number {
  switch (action) {
    case "fix_code":
    case "rebase":
      return 1;
    case "cancel":
      return 2;
    case "escalate":
      return 3;
    default:
      return 0;
  }
}

export function deriveSimpleReady(s: PrSummary): boolean {
  return (
    s.mergeStateStatus === "CLEAN" &&
    s.ciState === "SUCCESS" &&
    s.unresolvedThreads === 0 &&
    s.reviewDecision !== "CHANGES_REQUESTED" &&
    !s.isDraft
  );
}
