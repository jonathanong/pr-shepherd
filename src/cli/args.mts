/**
 * CLI argument-parsing helpers extracted from cli.mts for testability.
 * Note: parseCommonArgs calls loadConfig() for cache TTL defaults.
 */

import { parseArgs } from "node:util";
import { loadConfig } from "../config/load.mts";
import type { GlobalOptions, ShepherdAction } from "../types.mts";
import { deriveVerdict } from "../commands/status.mts";
import type { PrSummary } from "../commands/status.mts";

// Flags that consume the next argument as their value (used for PR-number
// detection only — prevents a flag's value from being mistaken for a PR number).
const FLAGS_WITH_VALUES = new Set([
  "--format",
  "--cache-ttl",
  "--last-push-time",
  "--ready-delay",
  "--cooldown-seconds",
  "--require-sha",
  "--message",
]);

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
  const cacheTtlSeconds = cacheTtlStr ? parseInt(cacheTtlStr, 10) : config.cache.ttlSeconds;

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
  // that belong to flags in FLAGS_WITH_VALUES (subcommand flags included).
  const skipForPrDetect = new Set<number>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (FLAGS_WITH_VALUES.has(arg)) {
      skipForPrDetect.add(i);
      if (i + 1 < args.length) skipForPrDetect.add(i + 1);
      i += 1;
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

// ---------------------------------------------------------------------------
// Duration parsing
// ---------------------------------------------------------------------------

export function parseDurationToMinutes(s: string, defaultMinutes?: number): number {
  const m = /^(\d+)(m|min|minutes?|h|hours?)?$/.exec(s.trim());
  if (!m) return defaultMinutes ?? loadConfig().watch.readyDelayMinutes;
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
  return deriveVerdict(s) === "READY";
}
