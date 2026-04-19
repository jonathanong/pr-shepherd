import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { parse } from "yaml";
import builtins from "../config.json" with { type: "json" };

export interface PrShepherdConfig {
  cache: {
    ttlSeconds: number;
  };
  iterate: {
    cooldownSeconds: number;
    fixAttemptsPerThread: number;
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
  };
  checks: {
    ciTriggerEvents: string[];
    timeoutPatterns: string[];
    infraPatterns: string[];
    logMaxLines: number;
    logMaxChars: number;
  };
  mergeStatus: {
    blockingReviewerLogins: string[];
  };
  execution: {
    maxBufferMb: number;
    triageLogBufferMb: number;
  };
  actions: {
    autoResolveOutdated: boolean;
    autoRebase: boolean;
    autoMarkReady: boolean;
  };
}

const RC_FILENAME = ".pr-shepherdrc.yml";

function findRcFile(startDir: string): string | null {
  const home = homedir();
  let current = startDir;
  while (true) {
    const candidate = join(current, RC_FILENAME);
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // not found here
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

// ---------------------------------------------------------------------------
// Compatibility shim — maps old RC keys to new ones and emits deprecation warnings
// ---------------------------------------------------------------------------

function applyCompat(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };

  // Removed keys — warn and strip.
  for (const gone of ["baseBranch", "minimizeBots", "cancelCiOnFailure", "autoMinimize"]) {
    if (gone in out) {
      process.stderr.write(
        `pr-shepherd: config key "${gone}" has been removed and has no effect.\n`,
      );
      delete out[gone];
    }
  }

  // Renamed top-level section keys — iterate
  const iterate = out["iterate"] as Record<string, unknown> | undefined;
  if (iterate && "maxFixAttempts" in iterate) {
    process.stderr.write(
      `pr-shepherd: config key "iterate.maxFixAttempts" renamed to "iterate.fixAttemptsPerThread".\n`,
    );
    out["iterate"] = { fixAttemptsPerThread: iterate["maxFixAttempts"], ...iterate };
    delete (out["iterate"] as Record<string, unknown>)["maxFixAttempts"];
  }

  // Renamed watch keys
  const watch = out["watch"] as Record<string, unknown> | undefined;
  if (watch) {
    const watchOut = { ...watch };
    if ("intervalDefault" in watch) {
      process.stderr.write(
        `pr-shepherd: config key "watch.intervalDefault" renamed to "watch.interval".\n`,
      );
      watchOut["interval"] = watch["intervalDefault"];
      delete watchOut["intervalDefault"];
    }
    if ("readyDelayMinutesDefault" in watch) {
      process.stderr.write(
        `pr-shepherd: config key "watch.readyDelayMinutesDefault" renamed to "watch.readyDelayMinutes".\n`,
      );
      watchOut["readyDelayMinutes"] = watch["readyDelayMinutesDefault"];
      delete watchOut["readyDelayMinutesDefault"];
    }
    if ("expiresHoursDefault" in watch) {
      process.stderr.write(
        `pr-shepherd: config key "watch.expiresHoursDefault" renamed to "watch.expiresHours".\n`,
      );
      watchOut["expiresHours"] = watch["expiresHoursDefault"];
      delete watchOut["expiresHoursDefault"];
    }
    out["watch"] = watchOut;
  }

  // Renamed resolve keys (shaPollIntervalMs / shaPollMaxAttempts → shaPoll object)
  const resolve = out["resolve"] as Record<string, unknown> | undefined;
  if (resolve) {
    const resolveOut = { ...resolve };
    const shaPollOut: Record<string, unknown> = {};
    let shaPollChanged = false;
    if ("shaPollIntervalMs" in resolve) {
      process.stderr.write(
        `pr-shepherd: config key "resolve.shaPollIntervalMs" moved to "resolve.shaPoll.intervalMs".\n`,
      );
      shaPollOut["intervalMs"] = resolve["shaPollIntervalMs"];
      delete resolveOut["shaPollIntervalMs"];
      shaPollChanged = true;
    }
    if ("shaPollMaxAttempts" in resolve) {
      process.stderr.write(
        `pr-shepherd: config key "resolve.shaPollMaxAttempts" moved to "resolve.shaPoll.maxAttempts".\n`,
      );
      shaPollOut["maxAttempts"] = resolve["shaPollMaxAttempts"];
      delete resolveOut["shaPollMaxAttempts"];
      shaPollChanged = true;
    }
    if (shaPollChanged) {
      resolveOut["shaPoll"] = {
        ...(resolveOut["shaPoll"] as Record<string, unknown> | undefined),
        ...shaPollOut,
      };
    }
    out["resolve"] = resolveOut;
  }

  // Renamed checks keys
  const checks = out["checks"] as Record<string, unknown> | undefined;
  if (checks) {
    const checksOut = { ...checks };
    if ("relevantEvents" in checks) {
      process.stderr.write(
        `pr-shepherd: config key "checks.relevantEvents" renamed to "checks.ciTriggerEvents".\n`,
      );
      checksOut["ciTriggerEvents"] = checks["relevantEvents"];
      delete checksOut["relevantEvents"];
    }
    if ("logLinesKept" in checks) {
      process.stderr.write(
        `pr-shepherd: config key "checks.logLinesKept" renamed to "checks.logMaxLines".\n`,
      );
      checksOut["logMaxLines"] = checks["logLinesKept"];
      delete checksOut["logLinesKept"];
    }
    if ("logExcerptMaxChars" in checks) {
      process.stderr.write(
        `pr-shepherd: config key "checks.logExcerptMaxChars" renamed to "checks.logMaxChars".\n`,
      );
      checksOut["logMaxChars"] = checks["logExcerptMaxChars"];
      delete checksOut["logExcerptMaxChars"];
    }
    out["checks"] = checksOut;
  }

  return out;
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
