/** A caller's acknowledgment of one observed CI-driven native-stack queue removal. */

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";

export interface QueueRemovalAcknowledgment {
  headSha: string;
  queueCommitOid: string;
  removedAtUnix: number;
}

type StateKey = { owner: string; repo: string; pr: number };
const FILE = "queue-removal-ack.json";

/** The only removal reasons that indicate a CI-driven queue ejection. */
export function isCiQueueRemovalReason(reason: string | null | undefined): boolean {
  return reason === "CI_FAILURE" || reason === "MERGE_QUEUE_POLICY_CHECK_FAILURE";
}

/** Missing, unreadable, or malformed acknowledgment state is treated as absent. */
export async function readQueueRemovalAcknowledgment(
  key: StateKey,
): Promise<QueueRemovalAcknowledgment | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(resolvePrStatePath(key, FILE), "utf8"));
    return isAcknowledgment(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Atomically store one acknowledgment. */
export async function writeQueueRemovalAcknowledgment(
  key: StateKey,
  acknowledgment: QueueRemovalAcknowledgment,
): Promise<boolean> {
  if (!isAcknowledgment(acknowledgment)) return false;
  let tmp: string | undefined;
  try {
    const path = resolvePrStatePath(key, FILE);
    tmp = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tmp, `${JSON.stringify(acknowledgment)}\n`, "utf8");
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
        // A failed write may not have created the temporary file.
      }
    }
  }
}

export function matchesQueueRemovalAcknowledgment(
  acknowledgment: QueueRemovalAcknowledgment | null,
  expected: Pick<QueueRemovalAcknowledgment, "headSha" | "queueCommitOid" | "removedAtUnix">,
): acknowledgment is QueueRemovalAcknowledgment {
  return (
    acknowledgment !== null &&
    acknowledgment.headSha === expected.headSha &&
    acknowledgment.queueCommitOid === expected.queueCommitOid &&
    acknowledgment.removedAtUnix === expected.removedAtUnix
  );
}

function isAcknowledgment(value: unknown): value is QueueRemovalAcknowledgment {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<QueueRemovalAcknowledgment>;
  return (
    typeof candidate.headSha === "string" &&
    /^[0-9a-f]{40}$/.test(candidate.headSha) &&
    typeof candidate.queueCommitOid === "string" &&
    /^[0-9a-f]{40}$/.test(candidate.queueCommitOid) &&
    typeof candidate.removedAtUnix === "number" &&
    Number.isSafeInteger(candidate.removedAtUnix) &&
    candidate.removedAtUnix > 0
  );
}
