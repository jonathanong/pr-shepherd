/**
 * One presented triage tick for a merge-queue removal Shepherd has no check failure to triage.
 *
 * `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/queue-removal-follow-up.json`
 * This records that Shepherd returned the investigation instruction for this head and removal,
 * not that the caller ran it. The next presented tick with the same head and removal escalates.
 * Internal debounce preview ticks do not write this marker.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";

interface StateKey {
  owner: string;
  repo: string;
  pr: number;
}

/** Identity of one removal on one head: a new head or a newer removal is a new situation. */
export function queueRemovalSignature(input: {
  headSha: string;
  createdAtUnix: number;
  beforeCommitOid?: string;
}): string {
  return `${input.headSha}#${input.createdAtUnix}#${input.beforeCommitOid ?? ""}`;
}

/** True when the investigation tick was already returned for exactly this removal. */
export async function readQueueRemovalFollowUp(key: StateKey, signature: string): Promise<boolean> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(resolvePrStatePath(key, "queue-removal-follow-up.json"), "utf8"),
    );
    return (
      parsed !== null &&
      typeof parsed === "object" &&
      (parsed as { signature?: unknown }).signature === signature
    );
  } catch {
    return false;
  }
}

/** Remember that the one investigation instruction was returned for this removal. */
export async function writeQueueRemovalFollowUp(key: StateKey, signature: string): Promise<void> {
  try {
    const path = resolvePrStatePath(key, "queue-removal-follow-up.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ signature }));
  } catch {
    // Best-effort: a missing marker only repeats the one investigation tick.
  }
}
