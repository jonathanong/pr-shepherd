import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";
import { discoverRuleFiles } from "../classify/loader.mts";
import { getEffectiveCwd } from "../execution-context.mts";
import type { PrFingerprint } from "../github/fingerprint.mts";
import type { PrShepherdConfig } from "../config/load.mts";
import type { ShepherdReport } from "../types.mts";

const VERSION = 3;

export interface StoredPrFingerprint {
  version: number;
  inputDigest: string;
  fingerprint: PrFingerprint;
  report: ShepherdReport;
}

export function fingerprintInputDigest(config: PrShepherdConfig): string {
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify({
      ignoreChecks: config.ignoreChecks,
      botUsernames: config.botUsernames,
      iterate: config.iterate,
      watch: { readyDelayMinutes: config.watch.readyDelayMinutes },
      checks: config.checks,
      mergeStatus: config.mergeStatus,
      actions: {
        autoMinimizeSuppressed: config.actions.autoMinimizeSuppressed,
        autoMarkReady: config.actions.autoMarkReady,
        neverCancelRuns: config.actions.neverCancelRuns,
        workWhileQueued: config.actions.workWhileQueued,
      },
    }),
  );
  for (const file of discoverRuleFiles(getEffectiveCwd())) {
    hash.update("\0");
    hash.update(file);
    hash.update("\0");
    try {
      hash.update(readFileSync(file));
    } catch {
      hash.update("missing");
    }
  }
  return hash.digest("hex").slice(0, 16);
}

export async function loadPrFingerprint(key: {
  owner: string;
  repo: string;
  pr: number;
}): Promise<StoredPrFingerprint | null> {
  const path = resolvePrStatePath(key, "fingerprint.json");
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isStoredFingerprint(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function storePrFingerprint(
  key: { owner: string; repo: string; pr: number },
  fingerprint: PrFingerprint,
  report: ShepherdReport,
  config: PrShepherdConfig,
): Promise<void> {
  const path = resolvePrStatePath(key, "fingerprint.json");
  let tmp: string | undefined;
  try {
    await mkdir(dirname(path), { recursive: true });
    tmp = `${path}.${randomUUID()}.tmp`;
    const payload: StoredPrFingerprint = {
      version: VERSION,
      inputDigest: fingerprintInputDigest(config),
      fingerprint,
      report,
    };
    await writeFile(tmp, `${JSON.stringify(payload)}\n`, "utf8");
    await rename(tmp, path);
    tmp = undefined;
  } catch {
    // Fingerprint cache is an optimization; a failed write just means the next tick refetches.
  } finally {
    if (tmp !== undefined) {
      try {
        await unlink(tmp);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

function isStoredFingerprint(value: unknown): value is StoredPrFingerprint {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record["version"] === VERSION &&
    typeof record["inputDigest"] === "string" &&
    record["fingerprint"] !== null &&
    typeof record["fingerprint"] === "object" &&
    record["report"] !== null &&
    typeof record["report"] === "object"
  );
}
