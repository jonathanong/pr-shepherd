/**
 * One repair tick for a stall timer that could not be saved.
 *
 * The per-PR state directory is what failed, so this marker lives beside it in the OS temp
 * directory instead: `<tmpdir>/pr-shepherd-stall-repair-<sha256(state base | scope)>.json`.
 * It records that Shepherd already told the caller to repair the state directory for this
 * reason. The next tick with the same reason escalates `stall-state-unavailable`. A marker
 * older than an hour is ignored, so an old failure does not escalate a new one at once.
 * When even the temp directory is unusable the marker cannot bound the repair tick, so the failure escalates at once.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { writeFile } from "./guarded-fs.mts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveStateBase } from "./base.mts";

const MAX_AGE_SECONDS = 3600;

/** The state store names its temporary file with a fresh UUID; it is not part of the failure's identity. */
function stableReason(reason: string): string {
  return reason.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
}

/** `scope` names the timer: `owner/repo#pr` or `owner/repo stack N`. */
export function stallRepairMarkerPath(scope: string): string {
  const hash = createHash("sha256").update(`${resolveStateBase()}|${scope}`).digest("hex");
  return join(tmpdir(), `pr-shepherd-stall-repair-${hash}.json`);
}

/** True when the repair tick for this reason was already presented within the last hour. */
export async function readStallRepair(scope: string, reason: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(stallRepairMarkerPath(scope), "utf8")) as {
      reason?: unknown;
      at?: unknown;
    };
    return (
      parsed.reason === stableReason(reason) &&
      typeof parsed.at === "number" &&
      Date.now() / 1000 - parsed.at < MAX_AGE_SECONDS
    );
  } catch {
    return false;
  }
}

/** False when the marker could not be saved: the repair tick would then repeat, so escalate. */
export async function writeStallRepair(scope: string, reason: string): Promise<boolean> {
  try {
    await writeFile(
      stallRepairMarkerPath(scope),
      JSON.stringify({ reason: stableReason(reason), at: Math.floor(Date.now() / 1000) }),
    );
    return true;
  } catch {
    return false;
  }
}
