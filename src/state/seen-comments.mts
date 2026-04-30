import { readFile, writeFile, rename, unlink, mkdir, access, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { SAFE_SEGMENT } from "../util/path-segment.mts";

import { resolveStateBase } from "./base.mts";

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

/** Compute a 16-hex-char SHA-256 prefix of a comment body. */
export function hashBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);
}

/**
 * Classify a candidate item against the seen map.
 *
 * - "new"       — no marker exists; surface the body and write the marker.
 * - "edited"    — marker exists but stored hash differs from the current body;
 *                 surface the updated body and update the marker hash.
 * - "unchanged" — marker exists and hash matches (or marker has no hash, which
 *                 is treated conservatively as unchanged).
 */
export function classifyItem(
  id: string,
  body: string,
  map: Map<string, SeenMarker>,
): "new" | "edited" | "unchanged" {
  const m = map.get(id);
  if (!m) return "new";
  if (typeof m.bodyHash === "string" && m.bodyHash !== hashBody(body)) return "edited";
  return "unchanged";
}

/**
 * Read the seen/ directory once and return a Set of already-seen IDs.
 * Prefer this over repeated hasSeen() calls to avoid EMFILE on large PRs.
 * Returns an empty Set if the directory does not yet exist.
 */
export async function loadSeenSet(key: StateKey): Promise<Set<string>> {
  try {
    const dir = resolveDir(key);
    const entries = await readdir(dir);
    return new Set(entries.filter((e) => e.endsWith(".json")).map((e) => e.slice(0, -5)));
  } catch {
    return new Set();
  }
}

/**
 * Read the seen/ directory and return a Map from ID to SeenMarker.
 * Used when the caller needs the stored bodyHash to detect in-place edits.
 * Returns an empty Map if the directory does not yet exist.
 */
export async function loadSeenMap(key: StateKey): Promise<Map<string, SeenMarker>> {
  const map = new Map<string, SeenMarker>();
  try {
    const dir = resolveDir(key);
    const entries = await readdir(dir);
    const ids = entries.filter((e) => e.endsWith(".json")).map((e) => e.slice(0, -5));
    for (const id of ids) {
      try {
        const raw = await readFile(join(dir, `${id}.json`), "utf8");
        map.set(id, JSON.parse(raw) as SeenMarker);
      } catch {
        // unreadable or malformed — skip
      }
    }
  } catch {
    // directory doesn't exist or unreadable — return empty map
  }
  return map;
}

/** Return true if a "seen" marker exists for this id. */
export async function hasSeen(key: StateKey, id: string): Promise<boolean> {
  try {
    await access(resolvePath(key, id));
    return true;
  } catch {
    return false;
  }
}

/**
 * Write (or update) a "seen" marker for this id, storing the body hash so
 * in-place edits can be detected on future fetches.
 *
 * - First call (no existing marker): creates `{ seenAt: now, bodyHash }`.
 * - Subsequent call, hash unchanged: no-op (skips the write).
 * - Subsequent call, hash changed: updates `bodyHash`, preserves original `seenAt`.
 *
 * All errors are silently swallowed — the marker is best-effort.
 */
export async function markSeen(key: StateKey, id: string, body: string): Promise<void> {
  let tmp: string | undefined;
  try {
    const path = resolvePath(key, id);
    await mkdir(dirname(path), { recursive: true });
    const newHash = hashBody(body);
    let existing: SeenMarker | null = null;
    try {
      const raw = await readFile(path, "utf8");
      existing = JSON.parse(raw) as SeenMarker;
    } catch {
      // no existing marker — will create below
    }
    if (existing !== null && existing.bodyHash === newHash) return;
    const seenAt = existing?.seenAt ?? Date.now();
    tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify({ seenAt, bodyHash: newHash }), "utf8");
    await rename(tmp, path);
    tmp = undefined;
  } catch {
    // best-effort
  } finally {
    if (tmp !== undefined) {
      try {
        await unlink(tmp);
      } catch {
        // best-effort cleanup
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

function resolveDir(key: StateKey): string {
  for (const [field, value] of [
    ["owner", key.owner],
    ["repo", key.repo],
  ] as const) {
    if (!SAFE_SEGMENT.test(value)) {
      throw new Error(`Invalid state key segment "${field}": ${value}`);
    }
  }
  const base = resolveStateBase();
  return join(base, `${key.owner}-${key.repo}`, String(key.pr), "seen");
}

function resolvePath(key: StateKey, id: string): string {
  if (!SAFE_SEGMENT.test(id)) {
    throw new Error(`Invalid state key segment "id": ${id}`);
  }
  return join(resolveDir(key), `${id}.json`);
}
