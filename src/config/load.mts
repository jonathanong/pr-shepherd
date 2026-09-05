/* eslint-disable max-lines */
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { parse } from "yaml";
import builtins from "../config.json" with { type: "json" };
import { getEffectiveCwd } from "../execution-context.mts";
import { findMergeStrategies } from "./merge-command-args.mts";

const MINIMIZE_COMMENTS_POLICIES = ["all", "bots", "users", "none"] as const;

export type MinimizeCommentsPolicy = (typeof MINIMIZE_COMMENTS_POLICIES)[number];

export interface GraphqlQuotaWarningBand {
  remainingPercent: number;
  pollIntervalMinutes: number;
}

export interface PrShepherdConfig {
  /** Optional user classification configuration; preserved for rule consumers. */
  classify?: unknown;
  /** GitHub logins that should be treated as bots even when GitHub reports User/Unknown. */
  botUsernames: string[];
  /** Case-insensitive glob patterns for check/status context names Shepherd should ignore. */
  ignoreChecks: string[];
  iterate: {
    fixAttemptsPerThread: number;
    stallTimeoutMinutes: number;
    /**
     * When `true`, APPROVED-state reviews are also eligible for minimization — defaults to `false`
     * so approvals stay visible. `minimizeComments` still filters by GitHub author type.
     */
    minimizeApprovals: boolean;
    /**
     * Which GitHub author classes should be auto-minimized for minimizable PR comments and review
     * summaries. Items excluded by this policy are still surfaced once (and after edits) via seen
     * markers so they do not repeat forever.
     */
    minimizeComments: MinimizeCommentsPolicy;
    /**
     * One-liner hint appended to the `fix_code` push instruction when the branch is behind its
     * base — e.g. "rebase --force-with-lease" or "see .agents/skills/git-and-prs.md". Empty
     * (default) omits the hint entirely; the CLI never prescribes rebase/merge mechanics itself.
     */
    behindBaseHint: string;
  };
  watch: {
    readyDelayMinutes: number;
    graphqlQuotaWarnings: GraphqlQuotaWarningBand[];
  };
  resolve: {
    shaPoll: {
      intervalMs: number;
      maxAttempts: number;
    };
  };
  checks: {
    ciTriggerEvents: string[];
  };
  mergeStatus: {
    blockingReviewerLogins: string[];
  };
  merge?: {
    /** Options added to ordinary `gh pr merge` commands. Queue commands never use these. */
    commandArgs: string[];
  };
  actions: {
    autoMinimizeSuppressed: boolean;
    autoMarkReady: boolean;
    /** Legacy-named patterns that keep matching Actions checks visible despite ignoreChecks. */
    neverCancelRuns: string[];
    /**
     * When `false` (default), `iterate --merge` defers non-CI actionable work
     * (review threads, comments, changes-requested reviews, review summaries)
     * while the PR sits in the merge queue, since a Shepherd-initiated push
     * would eject it. When `true`, restores pre-existing behavior: actionable
     * work is handled immediately regardless of queue membership.
     */
    workWhileQueued: boolean;
    /** @deprecated Accepted for compatibility, ignored by the loader. */
    autoResolveOutdated?: boolean;
    /** @deprecated Accepted for compatibility, ignored by the loader. */
    commitSuggestions?: boolean;
  };
}

const RC_FILENAME = ".pr-shepherdrc.yml";

/**
 * Collect `.pr-shepherdrc.yml` files from `startDir` toward `$HOME` (closest first).
 * `$HOME/.pr-shepherdrc.yml` is always included when it exists, even if cwd is
 * outside the home directory. The walk never includes the filesystem root, so a
 * `/.pr-shepherdrc.yml` cannot override the user-level file.
 */
function collectRcFiles(startDir: string): string[] {
  const home = resolve(homedir());
  const seen = new Set<string>();
  const files: string[] = [];

  const add = (dir: string): void => {
    const candidate = resolve(join(dir, RC_FILENAME));
    if (seen.has(candidate)) return;
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
      seen.add(candidate);
      files.push(candidate);
    }
  };

  let current = resolve(startDir);
  while (current !== dirname(current)) {
    add(current);
    if (current === home) break;
    current = dirname(current);
  }
  add(home);
  return files;
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const overVal = override[key];
    const baseVal = base[key];
    if (
      overVal !== null &&
      typeof overVal === "object" &&
      !Array.isArray(overVal) &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else if (overVal !== undefined) {
      result[key] = overVal;
    }
  }
  return result;
}

function isMinimizeCommentsPolicy(value: unknown): value is MinimizeCommentsPolicy {
  return MINIMIZE_COMMENTS_POLICIES.some((policy) => policy === value);
}

function parseMinimizeCommentsPolicy(value: unknown): MinimizeCommentsPolicy {
  if (value === "users") {
    process.stderr.write(
      'pr-shepherd: config: iterate.minimizeComments: "users" is deprecated and is now treated as "none".\n',
    );
    return "none";
  }
  if (isMinimizeCommentsPolicy(value)) return value;
  throw new Error(
    `Invalid config: iterate.minimizeComments must be one of "all", "bots", "users", or "none", got ${JSON.stringify(value)}`,
  );
}

function parseBotUsernames(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Invalid config: botUsernames must be an array of strings`);
  }
  return value;
}

function parseIgnoreChecks(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Invalid config: ignoreChecks must be an array of strings`);
  }
  return value;
}

function parseNeverCancelRuns(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Invalid config: actions.neverCancelRuns must be an array of strings`);
  }
  return value;
}

const SHEPHERD_OWNED_MERGE_FLAGS = [
  "--repo",
  "-R",
  "--auto",
  "--disable-auto",
  "--match-head-commit",
  "--admin",
  "--body-file",
  "-F",
  "--help",
  "-h",
];

function parseMergeCommandArgs(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("Invalid config: merge.commandArgs must be an array of strings");
  }
  for (const arg of value) {
    if (
      SHEPHERD_OWNED_MERGE_FLAGS.some(
        (flag) =>
          arg === flag ||
          arg.startsWith(`${flag}=`) ||
          (flag.startsWith("-") && !flag.startsWith("--") && arg.startsWith(flag)),
      )
    ) {
      throw new Error(`Invalid config: merge.commandArgs cannot include Shepherd-owned ${arg}`);
    }
  }
  const strategies = findMergeStrategies(value);
  if (strategies.length > 1) {
    throw new Error(
      `Invalid config: merge.commandArgs includes multiple merge strategies: ${strategies.join(", ")}`,
    );
  }
  return strategies.length === 0 ? [...value, "--merge"] : [...value];
}

function parseGraphqlQuotaWarnings(value: unknown): GraphqlQuotaWarningBand[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid config: watch.graphqlQuotaWarnings must be an array");
  }
  const seen = new Set<number>();
  const parsed = value.map((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Invalid config: watch.graphqlQuotaWarnings[${index}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    const remainingPercent = record["remainingPercent"];
    const pollIntervalMinutes = record["pollIntervalMinutes"];
    if (
      typeof remainingPercent !== "number" ||
      !Number.isInteger(remainingPercent) ||
      remainingPercent < 1 ||
      remainingPercent > 100
    ) {
      throw new Error(
        `Invalid config: watch.graphqlQuotaWarnings[${index}].remainingPercent must be an integer from 1 to 100`,
      );
    }
    if (
      typeof pollIntervalMinutes !== "number" ||
      !Number.isFinite(pollIntervalMinutes) ||
      pollIntervalMinutes <= 0
    ) {
      throw new Error(
        `Invalid config: watch.graphqlQuotaWarnings[${index}].pollIntervalMinutes must be a positive number`,
      );
    }
    if (seen.has(remainingPercent)) {
      throw new Error(
        `Invalid config: watch.graphqlQuotaWarnings has duplicate remainingPercent ${remainingPercent}`,
      );
    }
    seen.add(remainingPercent);
    return { remainingPercent, pollIntervalMinutes };
  });
  return parsed.sort((left, right) => right.remainingPercent - left.remainingPercent);
}

const KNOWN_CONFIG_KEYS = new Set([
  "classify",
  "botUsernames",
  "ignoreChecks",
  "iterate",
  "watch",
  "resolve",
  "checks",
  "mergeStatus",
  "merge",
  "actions",
]);
const KNOWN_NESTED_KEYS: Record<string, ReadonlySet<string>> = {
  iterate: new Set([
    "fixAttemptsPerThread",
    "stallTimeoutMinutes",
    "minimizeApprovals",
    "minimizeComments",
    "behindBaseHint",
  ]),
  watch: new Set(["readyDelayMinutes", "graphqlQuotaWarnings"]),
  resolve: new Set(["shaPoll"]),
  checks: new Set(["ciTriggerEvents"]),
  mergeStatus: new Set(["blockingReviewerLogins"]),
  merge: new Set(["commandArgs"]),
  actions: new Set([
    "autoMinimizeSuppressed",
    "autoMarkReady",
    "neverCancelRuns",
    "workWhileQueued",
    "autoResolveOutdated",
    "commitSuggestions",
  ]),
};

function warnUnknownConfigKeys(config: Record<string, unknown>): void {
  for (const key of Object.keys(config)) {
    if (!KNOWN_CONFIG_KEYS.has(key)) {
      process.stderr.write(`pr-shepherd: config: unknown key "${key}" ignored.\n`);
      delete config[key];
      continue;
    }
    const value = config[key];
    const nested = KNOWN_NESTED_KEYS[key];
    if (
      nested === undefined ||
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      continue;
    }
    for (const child of Object.keys(value as Record<string, unknown>)) {
      if (!nested.has(child)) {
        process.stderr.write(`pr-shepherd: config: unknown key "${key}.${child}" ignored.\n`);
        delete (value as Record<string, unknown>)[child];
      }
    }
  }
}

const defaults = builtins as PrShepherdConfig;

const configCache = new Map<string, PrShepherdConfig>();

function stripDeprecatedActionKeys(parsed: Record<string, unknown>): void {
  const rawActions = parsed.actions;
  if (rawActions === null || typeof rawActions !== "object" || Array.isArray(rawActions)) return;
  const actions = rawActions as Record<string, unknown>;
  for (const key of ["autoResolveOutdated", "commitSuggestions"] as const) {
    if (key in actions) {
      process.stderr.write(`pr-shepherd: config: actions.${key} is deprecated and ignored.\n`);
      delete actions[key];
    }
  }
}

function readRcFile(rcPath: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(rcPath, "utf8");
    const parsed = (parse(raw) ?? {}) as Record<string, unknown>;
    stripDeprecatedActionKeys(parsed);
    warnUnknownConfigKeys(parsed);
    return parsed;
  } catch (err) {
    process.stderr.write(
      `pr-shepherd: failed to parse ${rcPath}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  }
}

export function loadConfig(): PrShepherdConfig {
  const cwd = getEffectiveCwd();
  if (configCache.has(cwd)) return configCache.get(cwd)!;

  const rcPaths = collectRcFiles(cwd);
  if (rcPaths.length === 0) {
    configCache.set(cwd, defaults);
    return defaults;
  }

  try {
    // Farthest file first so closer directories override, ESLint-style.
    let overlay: Record<string, unknown> = {};
    let loaded = false;
    for (const rcPath of [...rcPaths].reverse()) {
      const parsed = readRcFile(rcPath);
      if (parsed === null) continue;
      overlay = deepMerge(overlay, parsed);
      loaded = true;
    }
    if (!loaded) {
      configCache.set(cwd, defaults);
      return defaults;
    }
    const config = deepMerge(
      structuredClone(defaults) as unknown as Record<string, unknown>,
      overlay,
    ) as unknown as PrShepherdConfig;
    config.botUsernames = parseBotUsernames(config.botUsernames);
    config.ignoreChecks = parseIgnoreChecks(config.ignoreChecks);
    config.actions.neverCancelRuns = parseNeverCancelRuns(config.actions.neverCancelRuns);
    if (config.merge) config.merge.commandArgs = parseMergeCommandArgs(config.merge.commandArgs);
    config.watch.graphqlQuotaWarnings = parseGraphqlQuotaWarnings(
      config.watch.graphqlQuotaWarnings,
    );
    config.iterate.minimizeComments = parseMinimizeCommentsPolicy(config.iterate.minimizeComments);
    configCache.set(cwd, config);
    return config;
  } catch (err) {
    process.stderr.write(
      `pr-shepherd: failed to parse ${rcPaths[0]}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    const fallback = { ...defaults };
    configCache.set(cwd, fallback);
    return fallback;
  }
}

/** Reset the config cache — for use in tests that change directories. */
export function _resetConfigCache(): void {
  configCache.clear();
}
