import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
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

/** Return true if a "seen" marker exists for this id. */
export async function hasSeen(key: StateKey, id: string): Promise<boolean> {
  try {
    await access(resolvePath(key, id));
    return true;
  } catch {
    return false;
  }
}

/** Write a "seen" marker for this id. Idempotent — preserves original seenAt on double-write. */
export async function markSeen(key: StateKey, id: string): Promise<void> {
  try {
    const path = resolvePath(key, id);
    await mkdir(dirname(path), { recursive: true });
    // O_EXCL: create-only — EEXIST means already marked, which is the idempotent success case.
    // seenAt is unix milliseconds (Date.now()), matching JS convention for this module.
    await writeFile(path, JSON.stringify({ seenAt: Date.now() }), { flag: "wx", encoding: "utf8" });
  } catch {
    // EEXIST = already seen. All other errors are best-effort.
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
  const base = process.env["PR_SHEPHERD_STATE_DIR"] ?? join(tmpdir(), "pr-shepherd-state");
  return join(base, `${key.owner}-${key.repo}`, String(key.pr), "seen");
}

function resolvePath(key: StateKey, id: string): string {
  if (!SAFE_SEGMENT.test(id)) {
    throw new Error(`Invalid state key segment "id": ${id}`);
  }
  return join(resolveDir(key), `${id}.json`);
}
