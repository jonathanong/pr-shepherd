import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { parse } from "yaml";
import builtins from "../config.json" with { type: "json" };
import { applyCompat } from "./compat.mts";

export interface PrShepherdConfig {
  cache: {
    ttlSeconds: number;
  };
  iterate: {
    cooldownSeconds: number;
    fixAttemptsPerThread: number;
    stallTimeoutMinutes: number;
    /**
     * Which review summaries the monitor loop should auto-minimize via `resolve --minimize-comment-ids`.
     * Bots default on; humans default on; approvals default off (opt-in). See docs/comments.md.
     */
    minimizeReviewSummaries: {
      /** Auto-minimize review summaries from known bot authors (copilot-pull-request-reviewer, `*[bot]`, etc.). */
      bots: boolean;
      /** Auto-minimize COMMENTED review summaries from non-bot (human) authors. */
      humans: boolean;
      /** Auto-minimize APPROVED-state reviews. Off by default — approvals usually stay visible. */
      approvals: boolean;
    };
  };
  watch: {
    interval: string;
    readyDelayMinutes: number;
    expiresHours: number;
    maxTurns: number;
  };
  resolve: {
    concurrency: number;
    shaPoll: {
      intervalMs: number;
      maxAttempts: number;
    };
    /** When false, COMMENTED review summaries are not surfaced in resolve --fetch output. */
    fetchReviewSummaries: boolean;
  };
  checks: {
    ciTriggerEvents: string[];
    timeoutPatterns: string[];
    infraPatterns: string[];
    logMaxLines: number;
    logMaxChars: number;
    /** Number of trailing `##[error]`-marked lines to surface per failing check. Default 1. */
    errorLines: number;
  };
  mergeStatus: {
    blockingReviewerLogins: string[];
  };
  actions: {
    autoResolveOutdated: boolean;
    autoRebase: boolean;
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

const defaults: PrShepherdConfig = builtins;

let cached: PrShepherdConfig | null = null;

export function loadConfig(): PrShepherdConfig {
  if (cached) return cached;

  const rcPath = findRcFile(process.cwd());
  if (!rcPath) {
    cached = defaults;
    return cached;
  }

  try {
    const raw = readFileSync(rcPath, "utf8");
    const parsed = (parse(raw) ?? {}) as Record<string, unknown>;
    const compat = applyCompat(parsed);
    cached = deepMerge(
      defaults as unknown as Record<string, unknown>,
      compat,
    ) as unknown as PrShepherdConfig;
    return cached;
  } catch (err) {
    process.stderr.write(
      `pr-shepherd: failed to parse ${rcPath}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    cached = { ...defaults };
    return cached;
  }
}
