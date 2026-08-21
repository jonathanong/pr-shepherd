/**
 * Persistent stall-detection state for the iterate loop.
 *
 * Tracks the fingerprint of the last iterate result and when that fingerprint
 * was first seen. If the fingerprint does not change for stallTimeoutSeconds
 * the iterate command escalates instead of repeating the same action.
 *
 * State lives in `$TMPDIR/pr-shepherd-state/<owner>-<repo>/<pr>/iterate-stall.json`.
 */

import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StallState {
  /** Canonicalized JSON fingerprint of the material iterate inputs. */
  fingerprint: string;
  /** Unix timestamp (seconds) when this fingerprint was first seen. */
  firstSeenAt: number;
}

interface StateKey {
  owner: string;
  repo: string;
  pr: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the current stall state. Returns null on miss, corrupt data, or invalid shape. */
export async function readStallState(key: StateKey): Promise<StallState | null> {
  try {
    const raw = await readFile(resolvePath(key), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>)["fingerprint"] !== "string" ||
      !Number.isFinite((parsed as Record<string, unknown>)["firstSeenAt"])
    ) {
      return null;
    }
    return parsed as StallState;
  } catch {
    return null;
  }
}

/** Clear stall state so the next invocation starts a fresh timer (fire-and-forget — never throws). */
export async function clearStallState(key: StateKey): Promise<void> {
  try {
    await unlink(resolvePath(key));
  } catch {
    // Best-effort — file may not exist.
  }
}

/** Write stall state (fire-and-forget — never throws). */
export async function writeStallState(key: StateKey, state: StallState): Promise<void> {
  let tmp: string | undefined;
  try {
    const path = resolvePath(key);
    tmp = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tmp, JSON.stringify(state), "utf8");
    await rename(tmp, path);
    tmp = undefined;
  } catch {
    // Best-effort.
  } finally {
    if (tmp !== undefined) {
      try {
        await unlink(tmp);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePath(key: StateKey): string {
  return resolvePrStatePath(key, "iterate-stall.json");
}
