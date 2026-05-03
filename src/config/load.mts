import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { parse } from "yaml";
import builtins from "../config.json" with { type: "json" };

export interface PrShepherdConfig {
  cli: {
    /** Command runner used in generated prompts. `auto` detects pnpm/yarn/npm from package metadata. */
    runner: "auto" | "npx" | "pnpm" | "yarn";
  };
  iterate: {
    cooldownSeconds: number;
    fixAttemptsPerThread: number;
    stallTimeoutMinutes: number;
    /**
     * All COMMENTED review summaries and PR-level comments are minimized once acted on; review
     * threads are resolved. When `true`, APPROVED-state reviews are also minimized — defaults to
     * `false` so approvals stay visible.
     */
    minimizeApprovals: boolean;
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
