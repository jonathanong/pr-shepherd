import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";
import type { RestMergeOptions, RestMergeResponse } from "../github/rest-merge.mts";

export interface MergeRequestRecord {
  version: 1;
  options: RestMergeOptions;
  startedAtUnix: number;
  uuid?: string;
  response?: RestMergeResponse;
  uncertain?: true;
}
type Key = { owner: string; repo: string; pr: number };
const path = (key: Key) => resolvePrStatePath(key, "merge-async.json");

export async function readMergeRequest(key: Key): Promise<MergeRequestRecord | null> {
  let raw: string;
  try {
    raw = await readFile(path(key), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const record = JSON.parse(raw) as MergeRequestRecord;
  if (
    record?.version !== 1 ||
    !/^[0-9a-f]{40}$/.test(record.options?.requireSha ?? "") ||
    !["direct_merge", "merge_queue", "default"].includes(record.options.mergeAction) ||
    !Number.isSafeInteger(record.startedAtUnix) ||
    (record.uuid !== undefined && !/^[0-9a-f-]{36}$/i.test(record.uuid))
  ) {
    throw new Error(
      "Invalid asynchronous merge state; outcome must be reconciled before another request",
    );
  }
  return record;
}

/** Persist intent exclusively before contacting GitHub; another process cannot submit it twice. */
export async function claimMergeRequest(key: Key, record: MergeRequestRecord): Promise<boolean> {
  await mkdir(dirname(path(key)), { recursive: true });
  try {
    await writeFile(path(key), `${JSON.stringify(record)}\n`, { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

/** One durable successor may replace a definitively failed request; uncertain requests stay intact. */
export async function replaceFailedMergeRequest(
  key: Key,
  previous: MergeRequestRecord,
  next: MergeRequestRecord,
): Promise<boolean> {
  if (previous.response?.status !== "failed" || previous.uncertain) return false;
  const generation = createHash("sha256")
    .update(JSON.stringify(previous))
    .digest("hex")
    .slice(0, 24);
  const successor = resolvePrStatePath(key, `merge-async-successor-${generation}.json`);
  try {
    await writeFile(successor, `${JSON.stringify(next)}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  const current = await readMergeRequest(key);
  if (JSON.stringify(current) !== JSON.stringify(previous)) return false;
  await writeMergeRequest(key, next);
  return true;
}

export async function writeMergeRequest(key: Key, record: MergeRequestRecord): Promise<void> {
  const destination = path(key);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(record)}\n`);
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
