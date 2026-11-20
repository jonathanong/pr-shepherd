import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  opendirSync,
  readSync,
  type Dirent,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** gh's HTTP cache TTL for its GraphQL schema feature-detection query. */
const GH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 4096;
const MAX_FILES_VISITED = 5000;
const MAX_SCAN_MS = 1500;
const MAX_DEPTH = 4;
const STALE_MARKER = '"type":"RATE_LIMIT"';

interface GhCacheStaleRateLimit {
  /** Absolute paths of cached responses that carry a GraphQL rate-limit error. */
  paths: string[];
  /** ISO time the newest listed entry expires on its own (mtime + 24h). */
  expiresAt: string;
}

/** Mirrors go-gh `config.CacheDir()`: XDG_CACHE_HOME, LocalAppData (Windows), `~/.cache/gh`. */
function ghCacheDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  if (env["XDG_CACHE_HOME"]) return join(env["XDG_CACHE_HOME"], "gh");
  if (platform === "win32" && env["LocalAppData"]) return join(env["LocalAppData"], "GitHub CLI");
  const home = homedir();
  return home ? join(home, ".cache", "gh") : join(tmpdir(), "gh-cli-cache");
}

/**
 * Read-only scan for cached `gh` responses that hold a GraphQL rate-limit error. `gh pr merge`
 * replays these for 24h. Any error, a missing directory, or an exceeded cap means "nothing found".
 */
export function scanGhCacheForRateLimit(
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): GhCacheStaleRateLimit | undefined {
  const deadline = Date.now() + MAX_SCAN_MS;
  const paths: string[] = [];
  let newest = 0;
  let visited = 0;
  /** Whether `full` is a small, fresh regular file whose body carries the marker. */
  const poisoned = (full: string): number | undefined => {
    let fd: number | undefined;
    try {
      fd = openSync(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const info = fstatSync(fd);
      if (!info.isFile() || info.size >= MAX_FILE_BYTES) return undefined;
      if (now - info.mtimeMs >= GH_CACHE_TTL_MS) return undefined;
      const buffer = Buffer.alloc(MAX_FILE_BYTES);
      const bytes = readSync(fd, buffer, 0, MAX_FILE_BYTES, 0);
      if (bytes >= MAX_FILE_BYTES) return undefined;
      return buffer.toString("utf8", 0, bytes).includes(STALE_MARKER) ? info.mtimeMs : undefined;
    } catch {
      return undefined;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  };
  const walk = (dir: string, depth: number): void => {
    let handle;
    try {
      handle = opendirSync(dir);
    } catch {
      return;
    }
    try {
      // Read one entry at a time so the caps bound enumeration, not just file reads.
      for (let entry: Dirent | null; (entry = handle.readSync()) !== null;) {
        if (visited >= MAX_FILES_VISITED || Date.now() > deadline) return;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (depth < MAX_DEPTH) walk(full, depth + 1);
          continue;
        }
        if (!entry.isFile()) continue;
        visited += 1;
        const mtime = poisoned(full);
        if (mtime === undefined) continue;
        paths.push(full);
        newest = Math.max(newest, mtime);
      }
    } catch {
      // Enumeration failed part-way: keep what was found.
    } finally {
      try {
        handle.closeSync();
      } catch {
        // Already closed.
      }
    }
  };
  walk(ghCacheDir(env, platform), 0);
  if (paths.length === 0) return undefined;
  return { paths: paths.sort(), expiresAt: new Date(newest + GH_CACHE_TTL_MS).toISOString() };
}
