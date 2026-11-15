/**
 * One presented triage tick for a merge-queue removal Shepherd has no check failure to triage.
 *
 * `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/queue-removal-follow-up.json`
 * This records that Shepherd returned the investigation instruction for this head and removal,
 * not that the caller ran it. The next presented tick with the same head and removal escalates.
 * Internal debounce preview ticks do not write this marker.
 */

import { readSignatureMarker, writeSignatureMarker, type StateKey } from "./signature-marker.mts";

const FILE = "queue-removal-follow-up.json";

/** Identity of one removal on one head: a new head or a newer removal is a new situation. */
export function queueRemovalSignature(input: {
  headSha: string;
  createdAtUnix: number;
  beforeCommitOid?: string;
}): string {
  return `${input.headSha}#${input.createdAtUnix}#${input.beforeCommitOid ?? ""}`;
}

/** True when the investigation tick was already returned for exactly this removal. */
export function readQueueRemovalFollowUp(key: StateKey, signature: string): Promise<boolean> {
  return readSignatureMarker(key, FILE, signature);
}

/** Remember that the one investigation instruction was returned for this removal. */
export function writeQueueRemovalFollowUp(key: StateKey, signature: string): Promise<void> {
  return writeSignatureMarker(key, FILE, signature);
}
