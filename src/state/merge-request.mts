import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";
import type { RestMergeOptions, RestMergeResponse } from "../github/rest-merge.mts";
import {
  restMergeStackGuardKey,
  validateRestMergeStackGuard,
} from "../github/rest-merge-stack-guard.mts";

export interface MergeRequestRecord {
  version: 1;
  options: RestMergeOptions;
  startedAtUnix: number;
  uuid?: string;
  response?: RestMergeResponse;
  uncertain?: true;
  /** Identifies the one consumable source of a permanently recorded successor. */
  replacementToken?: string;
}
type Key = { owner: string; repo: string; pr: number };
const path = (key: Key) => resolvePrStatePath(key, "merge-async.json");
const generation = (record: MergeRequestRecord) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        record.options.requireSha,
        record.options.mergeAction,
        record.options.mergeMethod,
        record.startedAtUnix,
        record.replacementToken,
        ...(record.options.expectedStack
          ? [restMergeStackGuardKey(record.options.expectedStack)]
          : []),
      ]),
    )
    .digest("hex")
    .slice(0, 24);
const statusPath = (key: Key, record: MergeRequestRecord) =>
  resolvePrStatePath(key, `merge-async-status-${generation(record)}.json`);

export async function readMergeRequest(key: Key): Promise<MergeRequestRecord | null> {
  let raw: string;
  try {
    raw = await readFile(path(key), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const record = parseRecord(raw);
  try {
    const status = parseRecord(await readFile(statusPath(key, record), "utf8"));
    if (generation(status) !== generation(record))
      throw new Error("Asynchronous merge status does not match its persisted intent");
    return status;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return record;
    throw error;
  }
}

function parseRecord(raw: string): MergeRequestRecord {
  const record = JSON.parse(raw) as MergeRequestRecord;
  if (
    record?.version !== 1 ||
    !/^[0-9a-f]{40}$/.test(record.options?.requireSha ?? "") ||
    !["direct_merge", "merge_queue", "default"].includes(record.options.mergeAction) ||
    !Number.isSafeInteger(record.startedAtUnix) ||
    (record.uuid !== undefined && !/^[0-9a-f-]{36}$/i.test(record.uuid)) ||
    (record.replacementToken !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        record.replacementToken,
      ))
  ) {
    throw new Error(
      "Invalid asynchronous merge state; outcome must be reconciled before another request",
    );
  }
  if (record.options.expectedStack !== undefined) {
    validateRestMergeStackGuard(record.options.expectedStack);
    if (record.options.expectedStack.prefix.at(-1)?.headRefOid !== record.options.requireSha)
      throw new Error(
        "Invalid asynchronous merge state: expectedStack head differs from guarded SHA",
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

/** Consume one durable successor of a failed request or an enqueue guarded by an older head. */
export async function replaceFailedMergeRequest(
  key: Key,
  previous: MergeRequestRecord,
  next: MergeRequestRecord,
): Promise<boolean> {
  if (
    previous.uncertain ||
    (previous.response?.status !== "failed" &&
      !(
        previous.response?.status === "enqueued" &&
        previous.options.requireSha !== next.options.requireSha
      ))
  )
    return false;
  const stem = resolvePrStatePath(key, `merge-async-successor-${generation(previous)}`);
  const candidate = { ...next, replacementToken: randomUUID() };
  const source = `${stem}-${candidate.replacementToken}.json`;
  let created = false;
  let published = false;
  try {
    await writeFile(source, `${JSON.stringify(candidate)}\n`, { flag: "wx" });
    created = true;
    if (JSON.stringify(await readMergeRequest(key)) !== JSON.stringify(previous)) return false;
    let persisted: MergeRequestRecord = candidate;
    try {
      // Publish only complete bytes. This permanent marker must never be consumed or rewritten.
      await link(source, `${stem}.json`);
      published = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      persisted = parseRecord(await readFile(`${stem}.json`, "utf8"));
      if (!persisted.replacementToken)
        throw new Error("Legacy merge successor has no recovery token; reconcile its outcome");
      if (
        persisted.options.requireSha !== next.options.requireSha ||
        persisted.options.mergeAction !== next.options.mergeAction ||
        persisted.options.mergeMethod !== next.options.mergeMethod ||
        restMergeStackGuardKey(persisted.options.expectedStack) !==
          restMergeStackGuardKey(next.options.expectedStack)
      )
        return false;
    }
    if (JSON.stringify(await readMergeRequest(key)) !== JSON.stringify(previous)) return false;
    try {
      // Never recreate this source: its absence means another caller already consumed the intent.
      await rename(`${stem}-${persisted.replacementToken}.json`, path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    return true;
  } finally {
    if (created && !published) await unlink(source).catch(() => {});
  }
}

export async function writeMergeRequest(key: Key, record: MergeRequestRecord): Promise<void> {
  await writeRecord(path(key), record);
}

/** A delayed status poll can update only its own intent, never a later main request. */
export async function writeMergeRequestStatus(key: Key, record: MergeRequestRecord): Promise<void> {
  await writeRecord(statusPath(key, record), record);
}

async function writeRecord(destination: string, record: MergeRequestRecord): Promise<void> {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(record)}\n`);
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
