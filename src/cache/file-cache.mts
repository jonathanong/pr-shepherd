/**
 * Simple filesystem-based cache for shepherd batch reads.
 *
 * Cache entries live in `${TMPDIR}/pr-shepherd-cache/<owner>-<repo>/<pr>/<shape>.json`.
 * TTL defaults to 5 minutes (configurable via PR_SHEPHERD_CACHE_TTL_SECONDS or --cache-ttl).
 *
 * Mutations are never cached — this module is read-path only.
 */

import { readFile, writeFile, rename, mkdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../config/load.mts";
import { SAFE_SEGMENT } from "../util/path-segment.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CacheOptions {
  ttlSeconds?: number;
  disabled?: boolean;
}

/**
 * Read a value from the cache. Returns null on miss or expiry.
 */
export async function cacheGet<T>(key: CacheKey, opts: CacheOptions = {}): Promise<T | null> {
  if (opts.disabled) return null;

  const ttl = opts.ttlSeconds ?? ttlFromEnv() ?? loadConfig().cache.ttlSeconds;
  // A TTL of 0 (or negative) means "always expired" — skip the filesystem read entirely.
  if (ttl <= 0) return null;

  try {
    const path = resolvePath(key);
    const stats = await stat(path);
    const ageSeconds = (Date.now() - stats.mtimeMs) / 1000;
    if (ageSeconds >= ttl) return null;

    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Write a value to the cache. Errors are swallowed — callers can await
 * to know when the write is done, but the write never rejects.
 */
export async function cacheSet<T>(key: CacheKey, value: T, opts: CacheOptions = {}): Promise<void> {
  if (opts.disabled) return;

  try {
    const path = resolvePath(key);
    const tmp = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tmp, JSON.stringify(value), "utf8");
    // Atomic rename — prevents a partial read if two processes write concurrently.
    await rename(tmp, path);
  } catch {
    // Cache writes are best-effort.
  }
}

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

export interface CacheKey {
  owner: string;
  repo: string;
  pr: number;
  shape: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolvePath(key: CacheKey): string {
  for (const [field, value] of [
    ["owner", key.owner],
    ["repo", key.repo],
    ["shape", key.shape],
  ] as const) {
    if (!SAFE_SEGMENT.test(value)) {
      throw new Error(`Invalid cache key segment "${field}": ${value}`);
    }
  }
  const base = process.env["PR_SHEPHERD_CACHE_DIR"] ?? join(tmpdir(), "pr-shepherd-cache");
  return join(base, `${key.owner}-${key.repo}`, String(key.pr), `${key.shape}.json`);
}

function ttlFromEnv(): number | undefined {
  const raw = process.env["PR_SHEPHERD_CACHE_TTL_SECONDS"];
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
