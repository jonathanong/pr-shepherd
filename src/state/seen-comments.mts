/* eslint-disable max-lines */
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
  id?: string;
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
  const currentHash = hashBody(body);
  if (typeof m.previousBodyHash === "string" && m.previousBodyHash === currentHash) {
    return "unchanged";
  }
  if (typeof m.bodyHash === "string" && m.bodyHash !== currentHash) return "edited";
  if (m.bodyHash === undefined && Array.isArray(m.inlineThreadIds)) return "new";
  return "unchanged";
}

/**
 * Read the seen/ directory once and return a Set of already-seen IDs.
 * Prefer this over repeated hasSeen() calls to avoid EMFILE on large PRs.
 * Returns an empty Set if the directory does not yet exist.
 */
export async function loadSeenSet(key: StateKey): Promise<Set<string>> {
  const map = await loadSeenMap(key);
  return new Set(map.keys());
}

/**
 * Read the seen/ directory and return a Map from ID to SeenMarker.
 * Used when the caller needs the stored bodyHash to detect in-place edits.
 * Returns an empty Map if the directory does not yet exist.
 *
 * Map keys are the stored `id` field when present (guarding against
 * case-insensitive filesystem collisions), falling back to the filename for
 * legacy markers that predate this field.
 */
export async function loadSeenMap(key: StateKey): Promise<Map<string, SeenMarker>> {
  const map = new Map<string, SeenMarker>();
  try {
    const dir = resolveDir(key);
    const entries = await readdir(dir);
    for (const entry of entries.filter((e) => e.endsWith(".json"))) {
      try {
        const raw = await readFile(join(dir, entry), "utf8");
        const marker = JSON.parse(raw) as SeenMarker;
        // Prefer the stored id field; fall back to filename stem for legacy markers.
        const mapKey = typeof marker.id === "string" ? marker.id : entry.slice(0, -5);
        // Hash-based markers (those with an id field) take priority over legacy
        // filename-based markers so that a stale legacy file cannot overwrite a
        // newer hash-based entry that maps to the same key.
        if (!map.has(mapKey) || typeof marker.id === "string") {
          map.set(mapKey, marker);
        }
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
 * - First call (no existing marker): creates `{ seenAt: now, bodyHash, id }`.
 * - Subsequent call, hash unchanged: no-op (skips the write).
 * - Subsequent call, hash changed: updates `bodyHash`, preserves original `seenAt`.
 *
 * All errors are silently swallowed — the marker is best-effort.
 */
export async function markSeen(key: StateKey, id: string, body: string): Promise<void> {
  await writeSeenMarker(key, id, { bodyHash: hashBody(body) });
}

export async function markReviewInlineThreads(
  key: StateKey,
  reviewId: string,
  inlineThreadIds: readonly string[],
): Promise<void> {
  await writeSeenMarker(key, reviewId, {
    inlineThreadIds: [...new Set(inlineThreadIds)].sort((a, b) => a.localeCompare(b)),
  });
}

/**
 * Write a marker after Shepherd successfully replies to a review thread.
 *
 * `previousBody` suppresses stale GitHub fetches that have not yet included the new reply.
 * `body` suppresses the expected final transcript once GitHub includes Shepherd's reply.
 */
export async function markReplySeen(
  key: StateKey,
  id: string,
  previousBody: string,
  body: string,
  replyBody: string,
): Promise<void> {
  await writeSeenMarker(key, id, {
    bodyHash: hashBody(body),
    previousBodyHash: hashBody(previousBody),
    replyBodyHash: hashBody(replyBody),
  });
}

async function writeSeenMarker(
  key: StateKey,
  id: string,
  markerFields: Record<string, unknown>,
): Promise<void> {
  let tmp: string | undefined;
  try {
    const path = resolvePath(key, id);
    await mkdir(dirname(path), { recursive: true });
    let existing: SeenMarker | null = null;
    try {
      const raw = await readFile(path, "utf8");
      existing = JSON.parse(raw) as SeenMarker;
    } catch {
      // no existing marker — will create below
    }
    const unchanged = Object.entries(markerFields).every(([field, value]) =>
      markerFieldEqual(existing?.[field], value),
    );
    if (existing !== null && unchanged) return;
    const seenAt = existing?.seenAt ?? Date.now();
    tmp = `${path}.${randomUUID()}.tmp`;
    // Store `id` in the payload so loadSeenMap can key by the original ID
    // rather than the filename, guarding against case-insensitive filesystems
    // (e.g. macOS APFS) where IDs differing only in case would collide.
    await writeFile(tmp, JSON.stringify({ ...existing, seenAt, ...markerFields, id }), "utf8");
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

function markerFieldEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  if (left !== null && right !== null && typeof left === "object" && typeof right === "object") {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
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
  // Hash the ID to produce a case-insensitive filename. On case-insensitive
  // filesystems (macOS APFS), IDs that differ only in case (e.g. base64 IDs
  // from GitHub like `ChG7F` vs `ChG7f`) would otherwise share the same file,
  // causing seen-markers to overwrite each other and items to re-surface every
  // tick. SHA-256 is case-sensitive so distinct IDs get distinct files.
  const hash = createHash("sha256").update(id, "utf8").digest("hex");
  return join(resolveDir(key), `${hash}.json`);
}
