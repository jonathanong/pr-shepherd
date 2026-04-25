/**
 * Per-item "seen" markers for review threads, PR comments, and reviews.
 *
 * Ensures every review item is surfaced to the agent at least once, even when
 * it is outdated, resolved, or minimized. Each marker is a small JSON file at
 * `$PR_SHEPHERD_STATE_DIR/<owner>-<repo>/<pr>/seen/<id>.json`.
 *
 * Schema: `{ seenAt: number }` — open object so future fields (e.g.
 * `classification`, `agentReply`) can be added without breaking readers.
 *
 * Race safety: writes are idempotent (same content on double-write) and
 * `hasSeen` is monotonic (once true, stays true). Concurrent calls from
 * parallel invocations are safe without locking.
 */

import { readFile, writeFile, rename, unlink, mkdir, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { SAFE_SEGMENT } from "../util/path-segment.mts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeenMarker {
  seenAt: number;
  // Open schema — future fields may be added without breaking older readers.
  [key: string]: unknown;
}

interface StateKey {
  owner: string;
  repo: string;
  pr: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return true if a "seen" marker exists for this id. */
export async function hasSeen(key: StateKey, id: string): Promise<boolean> {
  try {
    await access(resolvePath(key, id));
    return true;
  } catch {
    return false;
  }
}

/** Write a "seen" marker for this id (fire-and-forget — never throws). */
export async function markSeen(key: StateKey, id: string): Promise<void> {
  let tmp: string | undefined;
  try {
    const path = resolvePath(key, id);
    tmp = `${path}.${randomUUID()}.tmp`;
    const marker: SeenMarker = { seenAt: Date.now() };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tmp, JSON.stringify(marker), "utf8");
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

/** Read the full marker for inspection (returns null on miss or error). */
export async function readSeenMarker(key: StateKey, id: string): Promise<SeenMarker | null> {
  try {
    const raw = await readFile(resolvePath(key, id), "utf8");
    return JSON.parse(raw) as SeenMarker;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePath(key: StateKey, id: string): string {
  for (const [field, value] of [
    ["owner", key.owner],
    ["repo", key.repo],
    ["id", id],
  ] as const) {
    if (!SAFE_SEGMENT.test(value)) {
      throw new Error(`Invalid state key segment "${field}": ${value}`);
    }
  }
  const base = process.env["PR_SHEPHERD_STATE_DIR"] ?? join(tmpdir(), "pr-shepherd-state");
  return join(base, `${key.owner}-${key.repo}`, String(key.pr), "seen", `${id}.json`);
}
