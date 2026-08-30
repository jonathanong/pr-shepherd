/**
 * Cross-tick GitHub API response cache — reduces redundant requests across
 * `pr-shepherd` poll ticks.
 *
 * Two entry kinds, both keyed by a caller-chosen logical `name` (hashed to a
 * filesystem-safe filename, mirroring seen-comments.mts):
 *
 * - "etag" entries back conditional REST requests (`If-None-Match`). A 200
 *   response overwrites the entry; a 304 leaves it untouched. Used for list
 *   endpoints whose content can change from tick to tick (job lists, run
 *   lists).
 * - "derived" entries cache a value computed from a response that is
 *   immutable once identified by its key — job-log excerpts once a job is
 *   terminal, check-run annotations once the check is COMPLETED. No ETag
 *   applies; the cache is keyed on an immutable identity instead.
 *
 * Entries live under `$PR_SHEPHERD_STATE_DIR/<owner>-<repo>/<pr>/rest-cache/`
 * and are removed for free when `pr-shepherd clean` deletes the PR's state
 * directory — there is no separate pruning routine.
 */

import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { resolvePrStatePath } from "./base.mts";

export interface StateKey {
  owner: string;
  repo: string;
  pr: number;
}

export interface EtagCacheEntry {
  kind: "etag";
  name: string;
  etag: string;
  body: unknown;
  storedAt: number;
  headSha?: string;
}

export interface DerivedCacheEntry<T = unknown> {
  kind: "derived";
  name: string;
  value: T;
  storedAt: number;
  headSha?: string;
}

type CacheEntry = EtagCacheEntry | DerivedCacheEntry;

export async function loadEtagEntry(key: StateKey, name: string): Promise<EtagCacheEntry | null> {
  const entry = await readEntry(key, name);
  return entry?.kind === "etag" ? entry : null;
}

export async function storeEtagEntry(
  key: StateKey,
  name: string,
  fields: { etag: string; body: unknown; headSha?: string },
): Promise<void> {
  await writeEntry(key, name, {
    kind: "etag",
    name,
    etag: fields.etag,
    body: fields.body,
    storedAt: Date.now(),
    ...(fields.headSha !== undefined && { headSha: fields.headSha }),
  });
}

export async function loadDerived<T = unknown>(
  key: StateKey,
  name: string,
): Promise<DerivedCacheEntry<T> | null> {
  const entry = await readEntry(key, name);
  return entry?.kind === "derived" ? (entry as DerivedCacheEntry<T>) : null;
}

export async function storeDerived<T = unknown>(
  key: StateKey,
  name: string,
  value: T,
  headSha?: string,
): Promise<void> {
  await writeEntry(key, name, {
    kind: "derived",
    name,
    value,
    storedAt: Date.now(),
    ...(headSha !== undefined && { headSha }),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readEntry(key: StateKey, name: string): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(resolvePath(key, name), "utf8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeEntry(key: StateKey, name: string, entry: CacheEntry): Promise<void> {
  let tmp: string | undefined;
  try {
    const path = resolvePath(key, name);
    await mkdir(dirname(path), { recursive: true });
    tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(entry), "utf8");
    await rename(tmp, path);
    tmp = undefined;
  } catch {
    // best-effort — a failed cache write just means the next tick re-fetches
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

function resolvePath(key: StateKey, name: string): string {
  const hash = createHash("sha256").update(name, "utf8").digest("hex");
  return resolvePrStatePath(key, "rest-cache", `${hash}.json`);
}
