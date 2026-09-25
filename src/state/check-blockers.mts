/**
 * Per-PR records that a failing check is blocked on an external PR or issue.
 *
 * `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/check-blockers.json`
 */

import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";

export interface CheckBlockerRef {
  owner: string;
  name: string;
  number: number;
  kind: "pull" | "issue";
}

export interface CheckBlockerRecord {
  checkName: string;
  blocker: CheckBlockerRef;
  /** Unix seconds. */
  recordedAt: number;
}

interface StateKey {
  owner: string;
  repo: string;
  pr: number;
}

const FILE = "check-blockers.json";

export function formatCheckBlockerRef(blocker: CheckBlockerRef): string {
  return `${blocker.owner}/${blocker.name}#${blocker.number}`;
}

/** Missing, unreadable, or malformed state is an empty list. Does not throw. */
export async function readCheckBlockers(key: StateKey): Promise<CheckBlockerRecord[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(resolvePrStatePath(key, FILE), "utf8"));
    if (parsed === null || typeof parsed !== "object") return [];
    const blockers = (parsed as { blockers?: unknown }).blockers;
    if (!Array.isArray(blockers)) return [];
    return blockers.filter(isRecord);
  } catch {
    return [];
  }
}

/** Insert or replace the record for `checkName`. Returns false when the file cannot be written. */
export async function writeCheckBlocker(
  key: StateKey,
  record: CheckBlockerRecord,
): Promise<boolean> {
  const blockers = (await readCheckBlockers(key)).filter(
    (item) => item.checkName !== record.checkName,
  );
  blockers.push(record);
  return writeAll(key, blockers);
}

/** Drop one check's record. A missing record is success and does not create a file. */
export async function clearCheckBlocker(key: StateKey, checkName: string): Promise<boolean> {
  const current = await readCheckBlockers(key);
  const blockers = current.filter((item) => item.checkName !== checkName);
  if (blockers.length === current.length) return true;
  return writeAll(key, blockers);
}

async function writeAll(key: StateKey, blockers: CheckBlockerRecord[]): Promise<boolean> {
  let tmp: string | undefined;
  try {
    const path = resolvePrStatePath(key, FILE);
    tmp = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tmp, `${JSON.stringify({ blockers })}\n`, "utf8");
    await rename(tmp, path);
    tmp = undefined;
    return true;
  } catch {
    return false;
  } finally {
    if (tmp !== undefined) {
      try {
        await unlink(tmp);
      } catch {
        // The failed write may not have created the temp file.
      }
    }
  }
}

function isRecord(value: unknown): value is CheckBlockerRecord {
  if (value === null || typeof value !== "object") return false;
  const record = value as Partial<CheckBlockerRecord>;
  return (
    typeof record.checkName === "string" &&
    record.checkName.length > 0 &&
    typeof record.recordedAt === "number" &&
    Number.isFinite(record.recordedAt) &&
    isBlocker(record.blocker)
  );
}

function isBlocker(value: unknown): value is CheckBlockerRef {
  if (value === null || typeof value !== "object") return false;
  const blocker = value as Partial<CheckBlockerRef>;
  return (
    (blocker.kind === "pull" || blocker.kind === "issue") &&
    typeof blocker.owner === "string" &&
    typeof blocker.name === "string" &&
    typeof blocker.number === "number" &&
    Number.isInteger(blocker.number) &&
    blocker.number > 0
  );
}
