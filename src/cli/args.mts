/**
 * CLI argument-parsing helpers extracted from cli.mts for testability.
 * Note: parseCommonArgs calls loadConfig() for cache TTL defaults.
 */

import { parseArgs } from "node:util";
import { loadConfig } from "../config/load.mts";
import type { GlobalOptions } from "../types.mts";

// Flags that consume the next argument as their value (used for PR-number
// detection only — prevents a flag's value from being mistaken for a PR number).
const FLAGS_WITH_VALUES = new Set([
  "--format",
  "--cache-ttl",
  "--ready-delay",
  "--cooldown-seconds",
  "--stall-timeout",
  "--require-sha",
  "--message",
  "--description",
  "--thread-id",
  "--resolve-thread-ids",
  "--minimize-comment-ids",
  "--dismiss-review-ids",
]);

// Boolean flags that do NOT consume the next argument. Any --flag not in this
// set and not in FLAGS_WITH_VALUES is treated conservatively as value-taking
// for PR-number detection — so removed flags don't silently cause their
// numeric value to be misidentified as the PR number.
const BOOLEAN_FLAGS = new Set([
  "--no-cache",
  "--fetch",
  "--no-auto-mark-ready",
  "--no-auto-cancel-actionable",
  "--dry-run",
]);

// ---------------------------------------------------------------------------
// Strict integer parsing
// ---------------------------------------------------------------------------

export function parseIntStrict(value: string, flag: string): number {
  if (!/^-?\d+$/.test(value.trim())) {
    throw new Error(`Invalid value for ${flag}: "${value}" is not an integer`);
  }
  return parseInt(value, 10);
}

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

  const { values, tokens } = parseArgs({
    args,
    strict: false,
    allowPositionals: true,
    tokens: true,
    options: {
      format: { type: "string" },
      "cache-ttl": { type: "string" },
      "no-cache": { type: "boolean" },
    },
  });

  const format = (values.format ?? "text") as string as "text" | "json";
  const noCache = (values["no-cache"] ?? false) as boolean;
  const cacheTtlStr = values["cache-ttl"] as string | undefined;
  const cacheTtlSeconds = cacheTtlStr
    ? parseIntStrict(cacheTtlStr, "--cache-ttl")
    : config.cache.ttlSeconds;

  // Build the set of arg indices consumed by global flags so we can strip
  // them from `extra`.  Subcommand-specific flags are left untouched.
  const consumedIndices = new Set<number>();
  for (const tok of tokens ?? []) {
    if (
      tok.kind === "option" &&
      (tok.name === "format" || tok.name === "cache-ttl" || tok.name === "no-cache")
    ) {
      consumedIndices.add(tok.index);
      // When the value is a separate arg (--flag value, not --flag=value),
      // inlineValue is false and the value occupies tok.index + 1.
      if ("inlineValue" in tok && tok.inlineValue === false && tok.value != null) {
        consumedIndices.add(tok.index + 1);
      }
    }
  }

  // Find the first positional arg that looks like a PR number, skipping values
  // that belong to value-taking flags. Any --flag not in BOOLEAN_FLAGS is
  // treated conservatively as value-taking so that removed flags don't cause
  // their numeric value to be misidentified as the PR number.
  const skipForPrDetect = new Set<number>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (FLAGS_WITH_VALUES.has(arg)) {
      skipForPrDetect.add(i);
      if (i + 1 < args.length) skipForPrDetect.add(i + 1);
      i += 1;
    } else if (arg.startsWith("--") && !arg.includes("=") && !BOOLEAN_FLAGS.has(arg)) {
      // Unknown non-boolean flag: conservatively skip the next non-flag arg.
      skipForPrDetect.add(i);
      if (i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
        skipForPrDetect.add(i + 1);
        i += 1;
      }
    } else {
      const eqIdx = arg.indexOf("=");
      if (eqIdx > 0 && FLAGS_WITH_VALUES.has(arg.slice(0, eqIdx))) {
        skipForPrDetect.add(i);
      }
    }
  }

  const prIndex = args.findIndex(
    (a, index) => !skipForPrDetect.has(index) && !a.startsWith("--") && /^\d+$/.test(a),
  );
  const prNumber = prIndex !== -1 ? parseInt(args[prIndex]!, 10) : undefined;

  // Remove consumed global-flag indices (and the PR number itself) from extra.
  if (prIndex !== -1) {
    consumedIndices.add(prIndex);
  }

  const extra = args.filter((_, i) => !consumedIndices.has(i));

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
  const prNumbers: number[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (FLAGS_WITH_VALUES.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) continue;
    const n = parseInt(arg, 10);
    if (Number.isFinite(n)) prNumbers.push(n);
  }
  return prNumbers;
}

// Re-export exit-code helpers so existing importers of args.mts keep working.
export {
  parseDurationToMinutes,
  statusToExitCode,
  iterateActionToExitCode,
  deriveSimpleReady,
} from "./exit-codes.mts";
