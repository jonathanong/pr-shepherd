import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";
import { fingerprintInputDigest } from "./pr-fingerprint.mts";
import type { PrShepherdConfig } from "../config/load.mts";
import type { ShepherdReport } from "../types.mts";

const VERSION = 1;

/**
 * The last REST-transport report plus the digest of the conditional-read snapshot it was built
 * from. The REST counterpart of `fingerprint.json`: when the next tick's reads are all 304 and
 * hash to the same digest, the stored report is still current.
 */
export interface StoredRestSnapshotReport {
  version: number;
  inputDigest: string;
  snapshotDigest: string;
  report: ShepherdReport;
}

type Key = { owner: string; repo: string; pr: number };

export async function loadRestSnapshotReport(key: Key): Promise<StoredRestSnapshotReport | null> {
  try {
    const parsed = JSON.parse(await readFile(resolvePrStatePath(key, "rest-report.json"), "utf8"));
    const record = parsed as Record<string, unknown>;
    return record["version"] === VERSION &&
      typeof record["inputDigest"] === "string" &&
      typeof record["snapshotDigest"] === "string" &&
      record["report"] !== null &&
      typeof record["report"] === "object"
      ? (parsed as StoredRestSnapshotReport)
      : null;
  } catch {
    return null;
  }
}

export async function storeRestSnapshotReport(
  key: Key,
  snapshotDigest: string,
  report: ShepherdReport,
  config: PrShepherdConfig,
): Promise<void> {
  const path = resolvePrStatePath(key, "rest-report.json");
  let tmp: string | undefined;
  try {
    await mkdir(dirname(path), { recursive: true });
    tmp = `${path}.${randomUUID()}.tmp`;
    const payload: StoredRestSnapshotReport = {
      version: VERSION,
      inputDigest: fingerprintInputDigest(config),
      snapshotDigest,
      report,
    };
    await writeFile(tmp, `${JSON.stringify(payload)}\n`, "utf8");
    await rename(tmp, path);
    tmp = undefined;
  } catch {
    // An optimization only; a failed write just means the next tick rebuilds the report.
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
