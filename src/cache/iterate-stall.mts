/**
 * Persistent stall-detection state for the iterate loop.
 *
 * Tracks the fingerprint of the last iterate result and when that fingerprint
 * was first seen. If the fingerprint does not change for stallTimeoutSeconds
 * the iterate command escalates instead of repeating the same action.
 *
 * State lives in `$TMPDIR/pr-shepherd-cache/<owner>-<repo>/<pr>/iterate-stall.json`.
 */

import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { SAFE_SEGMENT } from "../util/path-segment.mts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StallState {
  /** Deterministic hash of the material iterate inputs. */
  fingerprint: string;
  /** Unix timestamp (seconds) when this fingerprint was first seen. */
  firstSeenAt: number;
}

interface CacheKey {
  owner: string;
  repo: string;
  pr: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the current stall state. Returns null on miss, corrupt data, or invalid shape. */
export async function readStallState(key: CacheKey): Promise<StallState | null> {
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

/** Write stall state (fire-and-forget — never throws). */
export async function writeStallState(key: CacheKey, state: StallState): Promise<void> {
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

function resolvePath(key: CacheKey): string {
  for (const [field, value] of [
    ["owner", key.owner],
    ["repo", key.repo],
  ] as const) {
    if (!SAFE_SEGMENT.test(value)) {
      throw new Error(`Invalid cache key segment "${field}": ${value}`);
    }
  }
  const base = process.env["PR_SHEPHERD_CACHE_DIR"] ?? join(tmpdir(), "pr-shepherd-cache");
  return join(base, `${key.owner}-${key.repo}`, String(key.pr), "iterate-stall.json");
}
