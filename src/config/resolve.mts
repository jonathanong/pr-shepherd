import type { z } from "zod";
import { STANDARD_RULE_NAMES } from "../classify/standard/index.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { findMergeStrategies } from "./merge-command-args.mts";
import { describeUnknownKey, formatPath } from "./renames.mts";
import { configSchema, type ConfigFile } from "./schema.mts";

export type MinimizeCommentsPolicy = ConfigFile["iterate"]["minimize-comments"];

export type ResolveOtherHumanThreads = ConfigFile["iterate"]["resolve-other-human-threads"];

export const INSTRUCTION_STYLES = ["playbook", "inline"] as const;

/**
 * How `fix_code` `## Instructions` render invariant procedure text. `inline` (default)
 * prints every step each tick; `playbook` folds them into one `Playbook: "Fix-code loop".` pointer.
 */
export type InstructionStyle = (typeof INSTRUCTION_STYLES)[number];

export function isInstructionStyle(value: unknown): value is InstructionStyle {
  return INSTRUCTION_STYLES.some((style) => style === value);
}

/** One `poll.quota-warnings` band resolved against `poll.interval-seconds`. */
export interface GraphqlQuotaWarningBand {
  remainingPercent: number;
  pollIntervalMinutes: number;
}

/** The validated v1 config: file keys as written, plus values derived from them. */
export type PrShepherdConfig = ConfigFile & {
  /** Bundled classification rules enabled by `classify.standard`, resolved and sorted by name. */
  standardRules: string[];
  /** `poll.quota-warnings` resolved to absolute intervals, highest `remaining-percent` first. */
  quotaWarningBands: GraphqlQuotaWarningBand[];
};

function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let current = root;
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return current;
}

export function issueLines(issue: z.core.$ZodIssue, raw: unknown): string[] {
  const path = issue.path.filter(
    (segment): segment is string | number => typeof segment !== "symbol",
  );
  if (issue.code === "unrecognized_keys") {
    return issue.keys.flatMap((key) =>
      describeUnknownKey([...path, key], valueAt(raw, [...path, key])),
    );
  }
  return [`\`${formatPath(path)}\`: ${issue.message}`];
}

export function configError(source: string, lines: string[]): ShepherdError {
  return new ShepherdError(
    `invalid config in ${source}:\n${lines.map((line) => `  - ${line}`).join("\n")}`,
    EXIT.CONFIG,
  );
}

/** Longest `setTimeout` delay, in seconds. A bigger aggregate sleep would clamp to ~24.8 days. */
const MAX_POLL_INTERVAL_SECONDS = (2 ** 31 - 1) / 1000;

function resolveQuotaWarnings(config: ConfigFile): {
  bands: GraphqlQuotaWarningBand[];
  errors: string[];
} {
  const intervalSeconds = config.poll["interval-seconds"];
  const errors: string[] = [];
  const bands = config.poll["quota-warnings"].map((band, index) => {
    const factor = band["interval-factor"];
    const factorMinutes = factor === undefined ? 0 : (intervalSeconds * factor) / 60;
    const pollIntervalMinutes = Math.max(band["interval-minutes"] ?? 0, factorMinutes);
    if (!Number.isFinite(pollIntervalMinutes)) {
      errors.push(`\`poll.quota-warnings[${index}]\`: resolves to a non-finite poll interval`);
    }
    return { remainingPercent: band["remaining-percent"], pollIntervalMinutes };
  });
  bands.sort((left, right) => right.remainingPercent - left.remainingPercent);
  const decreasing = bands.some(
    (band, index) =>
      index > 0 && band.pollIntervalMinutes < (bands[index - 1]?.pollIntervalMinutes ?? 0),
  );
  if (decreasing) {
    errors.push(
      "`poll.quota-warnings`: the resolved interval must not decrease as remaining-percent decreases",
    );
  }
  return { bands, errors };
}

/** Checks that span keys which may come from different files, so run after merging. */
function crossKeyErrors(config: ConfigFile): string[] {
  const errors: string[] = [];
  const aggregate = config.poll["interval-seconds"] * config.poll["stack-interval-factor"];
  if (!(aggregate <= MAX_POLL_INTERVAL_SECONDS)) {
    errors.push(
      `\`poll.interval-seconds\` × \`poll.stack-interval-factor\` must be at most ${MAX_POLL_INTERVAL_SECONDS} seconds, got ${aggregate}`,
    );
  }
  const method = config.merge.method;
  const fromArgs = findMergeStrategies(config.merge["command-args"])[0];
  if (method !== undefined && fromArgs !== undefined && fromArgs !== method) {
    errors.push(
      `\`merge.method\` ${method} conflicts with the \`merge.command-args\` strategy ${fromArgs}`,
    );
  }
  return errors;
}

function resolveStandardRules(config: ConfigFile): string[] {
  const flags: Partial<Record<string, boolean>> = config.classify.standard;
  const all = flags["all"] ?? false;
  return STANDARD_RULE_NAMES.filter((name) => flags[name] ?? all).sort();
}

/**
 * Validate a merged raw config, apply defaults, and derive the resolved values. `source` names
 * the files the raw object came from; it appears in errors.
 */
export function resolveConfig(raw: Record<string, unknown>, source = "built-in defaults") {
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw configError(
      source,
      result.error.issues.flatMap((issue) => issueLines(issue, raw)),
    );
  }
  const config = result.data;
  const quota = resolveQuotaWarnings(config);
  const errors = [...crossKeyErrors(config), ...quota.errors];
  if (errors.length > 0) throw configError(source, errors);
  const resolved: PrShepherdConfig = {
    ...config,
    standardRules: resolveStandardRules(config),
    quotaWarningBands: quota.bands,
  };
  return resolved;
}
