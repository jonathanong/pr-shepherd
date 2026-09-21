import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";

/**
 * Durable evidence that a single-PR Shepherd poll observed a ready PR after
 * its ready-delay elapsed.  The ref OIDs and readiness fingerprint are part of
 * the evidence: a receipt is never a general-purpose "this PR is ready"
 * cache.
 */
export interface ReadyReceipt {
  version: 1;
  owner: string;
  repo: string;
  pr: number;
  headRefOid: string;
  baseRefOid: string;
  status: "READY";
  isDraft: false;
  /** Canonical representation of the readiness inputs observed by Shepherd. */
  readinessFingerprint: string;
  recordedAtUnix: number;
}

export interface ReadyReceiptKey {
  owner: string;
  repo: string;
  pr: number;
}

export interface ReadyReceiptCurrentState {
  headRefOid: string;
  baseRefOid: string;
  readinessFingerprint: string;
  status: string;
  isDraft: boolean;
}

/** Read a persisted one-PR readiness receipt. Invalid/stale-shaped files are ignored. */
export async function readReadyReceipt(key: ReadyReceiptKey): Promise<ReadyReceipt | null> {
  const path = receiptPath(key);
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isReadyReceipt(parsed) && sameKey(parsed, key) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist evidence for a completed one-PR ready-delay observation. */
export async function writeReadyReceipt(receipt: ReadyReceipt): Promise<void> {
  if (!isReadyReceipt(receipt)) throw new Error("Invalid ready receipt");
  const path = receiptPath(receipt);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(receipt)}\n`, "utf8");
}

/** Remove a receipt after the observed PR state no longer matches it. */
export async function clearReadyReceipt(key: ReadyReceiptKey): Promise<void> {
  try {
    await unlink(receiptPath(key));
  } catch {
    // Missing receipts are already clear.
  }
}

/**
 * Check the complete binding before using a receipt for aggregate routing.
 * Callers must provide a fresh fingerprint from the same readiness inputs used
 * to create the receipt; ref OIDs alone are not sufficient.
 */
export function isReadyReceiptCurrent(
  receipt: ReadyReceipt | null,
  current: ReadyReceiptCurrentState,
): receipt is ReadyReceipt {
  return (
    receipt !== null &&
    receipt.status === "READY" &&
    receipt.isDraft === false &&
    current.status === "READY" &&
    current.isDraft === false &&
    receipt.headRefOid === current.headRefOid &&
    receipt.baseRefOid === current.baseRefOid &&
    receipt.readinessFingerprint === current.readinessFingerprint
  );
}

function receiptPath(key: ReadyReceiptKey): string {
  return resolvePrStatePath(key, "ready-receipt.json");
}

function sameKey(receipt: ReadyReceipt, key: ReadyReceiptKey): boolean {
  return receipt.owner === key.owner && receipt.repo === key.repo && receipt.pr === key.pr;
}

function isReadyReceipt(value: unknown): value is ReadyReceipt {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<ReadyReceipt>;
  return (
    candidate.version === 1 &&
    typeof candidate.owner === "string" &&
    typeof candidate.repo === "string" &&
    typeof candidate.pr === "number" &&
    Number.isInteger(candidate.pr) &&
    candidate.pr > 0 &&
    typeof candidate.headRefOid === "string" &&
    candidate.headRefOid.length > 0 &&
    typeof candidate.baseRefOid === "string" &&
    candidate.baseRefOid.length > 0 &&
    candidate.status === "READY" &&
    candidate.isDraft === false &&
    typeof candidate.readinessFingerprint === "string" &&
    candidate.readinessFingerprint.length > 0 &&
    typeof candidate.recordedAtUnix === "number" &&
    Number.isFinite(candidate.recordedAtUnix)
  );
}
