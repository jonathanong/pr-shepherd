import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { parse } from "yaml";
import builtins from "../config.json" with { type: "json" };

const MINIMIZE_COMMENTS_POLICIES = ["all", "bots", "users", "none"] as const;

export type MinimizeCommentsPolicy = (typeof MINIMIZE_COMMENTS_POLICIES)[number];

export interface PrShepherdConfig {
  /** GitHub logins that should be treated as bots even when GitHub reports User/Unknown. */
  botUsernames: string[];
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
  };
  watch: {
    readyDelayMinutes: number;
  };
  resolve: {
    shaPoll: {
      intervalMs: number;
      maxAttempts: number;
    };
    /** When false, COMMENTED review summaries are not surfaced in resolve --fetch output. */
    fetchReviewSummaries: boolean;
  };
  checks: {
    ciTriggerEvents: string[];
  };
  mergeStatus: {
    blockingReviewerLogins: string[];
  };
  actions: {
    autoResolveOutdated: boolean;
    autoMarkReady: boolean;
    /** When true, the resolve skill prefers applying reviewer suggestion blocks as a commit over manual edits. */
    commitSuggestions: boolean;
  };
}

const RC_FILENAME = ".pr-shepherdrc.yml";

function findRcFile(startDir: string): string | null {
  const home = homedir();
  let current = startDir;
  while (true) {
    const candidate = join(current, RC_FILENAME);
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
      return candidate;
    }
    if (current === home || current === dirname(current)) return null;
    current = dirname(current);
  }
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

const defaults = builtins as PrShepherdConfig;

const configCache = new Map<string, PrShepherdConfig>();

export function loadConfig(): PrShepherdConfig {
  const cwd = process.cwd();
  if (configCache.has(cwd)) return configCache.get(cwd)!;

  const rcPath = findRcFile(cwd);
  if (!rcPath) {
    configCache.set(cwd, defaults);
    return defaults;
  }

  try {
    const raw = readFileSync(rcPath, "utf8");
    const parsed = (parse(raw) ?? {}) as Record<string, unknown>;
    const config = deepMerge(
      defaults as unknown as Record<string, unknown>,
      parsed,
    ) as unknown as PrShepherdConfig;
    config.botUsernames = parseBotUsernames(config.botUsernames);
    config.iterate.minimizeComments = parseMinimizeCommentsPolicy(config.iterate.minimizeComments);
    configCache.set(cwd, config);
    return config;
  } catch (err) {
    process.stderr.write(
      `pr-shepherd: failed to parse ${rcPath}: ${err instanceof Error ? err.message : String(err)}\n`,
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
