/**
 * Persistent attempt counter for the iterate escalation guard.
 *
 * Tracks how many times each review thread has been dispatched to the fix_code
 * handler without being resolved. Counts are reset automatically when the HEAD
 * commit SHA changes (i.e. a new push landed).
 *
 * State lives in `$TMPDIR/pr-shepherd-cache/<owner>-<repo>/<pr>/fix-attempts.json`.
 */

import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { SAFE_SEGMENT } from "../util/path-segment.mts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FixAttemptsState {
  /** HEAD SHA at the time the counts were last written. Reset key. */
  headSha: string;
  /** Map from thread ID → number of fix_code dispatches that included this thread. */
  threadAttempts: Record<string, number>;
}

interface CacheKey {
  owner: string;
  repo: string;
  pr: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the current attempt state. Returns null on miss. */
export async function readFixAttempts(key: CacheKey): Promise<FixAttemptsState | null> {
  try {
    const raw = await readFile(resolvePath(key), "utf8");
    return JSON.parse(raw) as FixAttemptsState;
  } catch {
    return null;
  }
}

/** Write attempt state (fire-and-forget — never throws). */
export async function writeFixAttempts(key: CacheKey, state: FixAttemptsState): Promise<void> {
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
  return join(base, `${key.owner}-${key.repo}`, String(key.pr), "fix-attempts.json");
}
