import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

interface StallState {
  /** Canonicalized JSON fingerprint of the material inputs. */
  fingerprint: string;
  /** Unix timestamp (seconds) when this fingerprint was first seen. */
  firstSeenAt: number;
}

export interface StallStateStore<Key> {
  /** Read the current stall state. Returns null on miss, corrupt data, invalid shape, or unsafe key. */
  read(key: Key): Promise<StallState | null>;
  /** Write stall state (fire-and-forget — never throws). */
  write(key: Key, state: StallState): Promise<void>;
  /** Clear stall state so the next invocation starts a fresh timer (fire-and-forget — never throws). */
  clear(key: Key): Promise<void>;
}

/**
 * Best-effort `{fingerprint, firstSeenAt}` files behind the one-PR and `--stack` stall guards.
 * `resolvePath` may throw for an unsafe key; every operation treats that like a missing file.
 */
export function stallStateStore<Key>(resolvePath: (key: Key) => string): StallStateStore<Key> {
  return {
    async read(key) {
      try {
        const parsed = JSON.parse(await readFile(resolvePath(key), "utf8")) as unknown;
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
    },

    async write(key, state) {
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
    },

    async clear(key) {
      try {
        await unlink(resolvePath(key));
      } catch {
        // Best-effort — file may not exist.
      }
    },
  };
}
