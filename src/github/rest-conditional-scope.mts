import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { StateKey } from "../state/rest-cache.mts";

/**
 * Per-PR scope that turns the named REST readers' GETs into `If-None-Match` conditional reads
 * backed by `src/state/rest-cache.mts`. It also records how each read was answered so a caller
 * can tell whether the whole snapshot was unchanged (every read 304).
 */
interface RestConditionalScope {
  key: StateKey;
  /** Reads that answered a changed or unvalidated body (any of them blocks reuse). */
  fresh: number;
  notModified: number;
  /** Latest validator seen per request path. */
  etags: Map<string, string>;
}

export interface RestSnapshotState {
  /**
   * True when at least one conditional read answered 304 and every other read was a settled body
   * without an ETag (fingerprinted by content instead). Any changed ETag-bearing body is fresh.
   */
  allNotModified: boolean;
  /** Stable digest of every (path, validator) the snapshot observed. */
  digest: string;
}

const storage = new AsyncLocalStorage<RestConditionalScope>();

export function withRestConditionalScope<T>(key: StateKey, fn: () => Promise<T>): Promise<T> {
  return storage.run({ key, fresh: 0, notModified: 0, etags: new Map() }, fn);
}

export function currentRestConditionalKey(): StateKey | undefined {
  return storage.getStore()?.key;
}

/**
 * Record how one read was answered. `contentBody` is passed only for a settled 200 that carried
 * no ETag: a route that cannot answer 304 (the Claude Code cloud proxy's `/ccr/review_threads`
 * may not send validators) is then validated by a hash of its content, so an unchanged body
 * still lets the snapshot's digest match. Every other non-304 read is fresh and blocks reuse.
 */
export function recordRestConditionalRead(
  path: string,
  notModified: boolean,
  etag: string | undefined,
  contentBody?: unknown,
): void {
  const scope = storage.getStore();
  if (scope === undefined) return;
  if (notModified) scope.notModified += 1;
  else if (etag !== undefined || contentBody === undefined) scope.fresh += 1;
  scope.etags.set(
    path,
    etag ?? (contentBody === undefined ? "" : `content:${contentDigest(contentBody)}`),
  );
}

function contentDigest(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body) ?? "")
    .digest("hex")
    .slice(0, 16);
}

export function restSnapshotState(): RestSnapshotState | undefined {
  const scope = storage.getStore();
  if (scope === undefined) return undefined;
  const hash = createHash("sha256");
  for (const [path, etag] of [...scope.etags].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    hash.update(`${path}\0${etag}\0`);
  }
  return {
    allNotModified: scope.fresh === 0 && scope.notModified > 0,
    digest: hash.digest("hex").slice(0, 16),
  };
}
