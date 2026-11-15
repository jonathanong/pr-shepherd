/**
 * One presented investigation tick for checks that never started.
 *
 * `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/ci-start-follow-up.json`
 * This records that Shepherd returned the investigation instruction for this head and these
 * unstarted checks, not that the caller ran it. The next presented tick with the same head and
 * checks escalates `stall-timeout`. Internal debounce preview ticks do not write this marker.
 */

import { readSignatureMarker, writeSignatureMarker, type StateKey } from "./signature-marker.mts";

const FILE = "ci-start-follow-up.json";

/** Identity of the stalled set: the head plus the sorted names of the unstarted checks. */
export function ciStartSignature(headSha: string, names: readonly string[]): string {
  return JSON.stringify([headSha, ...[...names].sort()]);
}

export function readCiStartFollowUp(key: StateKey, signature: string): Promise<boolean> {
  return readSignatureMarker(key, FILE, signature);
}

/** The save error, if any, so the caller escalates instead of repeating the investigation. */
export function writeCiStartFollowUp(
  key: StateKey,
  signature: string,
): Promise<string | undefined> {
  return writeSignatureMarker(key, FILE, signature);
}
