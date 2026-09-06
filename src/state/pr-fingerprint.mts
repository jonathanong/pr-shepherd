import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { resolvePrStatePath } from "./base.mts";
import type { PrFingerprint } from "../github/fingerprint.mts";
import type { ShepherdReport } from "../types.mts";

const VERSION = 1;

export interface StoredPrFingerprint {
  version: number;
  fingerprint: PrFingerprint;
  report: ShepherdReport;
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
): Promise<void> {
  const path = resolvePrStatePath(key, "fingerprint.json");
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  const payload: StoredPrFingerprint = { version: VERSION, fingerprint, report };
  await writeFile(tmp, `${JSON.stringify(payload)}\n`, "utf8");
  await rename(tmp, path);
}

function isStoredFingerprint(value: unknown): value is StoredPrFingerprint {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record["version"] === VERSION &&
    record["fingerprint"] !== null &&
    typeof record["fingerprint"] === "object" &&
    record["report"] !== null &&
    typeof record["report"] === "object"
  );
}
