import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

interface StallState {
  /** Canonicalized JSON fingerprint of the material inputs. */
  fingerprint: string;
  /** Unix timestamp (seconds) when this fingerprint was first seen. */
  firstSeenAt: number;
}

/** A missing or unreadable-as-JSON file is `state: null`. Any other I/O or key error is `ok: false`. */
type StallReadResult = { ok: true; state: StallState | null } | { ok: false; reason: string };

type StallWriteResult = { ok: true } | { ok: false; reason: string };

export interface StallStateStore<Key> {
  /** Read the current stall state. Does not throw. */
  read(key: Key): Promise<StallReadResult>;
  /** Write stall state. Does not throw; `ok: false` means the timer was not saved. */
  write(key: Key, state: StallState): Promise<StallWriteResult>;
  /** Clear stall state so the next invocation starts a fresh timer (fire-and-forget — never throws). */
  clear(key: Key): Promise<void>;
}

/**
 * `{fingerprint, firstSeenAt}` files behind the one-PR and `--stack` stall guards.
 * A missing file is a miss. An unwritable directory or an unsafe key is a persistence failure
 * so the caller can hand off instead of treating every tick as the first sighting.
 * `ENOENT` is the only read error treated as a miss. Corrupt JSON is also a miss, so one
 * successful rewrite can start the timer again.
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
          return { ok: true, state: null };
        }
        return { ok: true, state: parsed as StallState };
      } catch (error) {
        // A missing file and corrupt JSON are both misses. One successful rewrite can start the timer.
        if (isEnoent(error) || error instanceof SyntaxError) return { ok: true, state: null };
        return { ok: false, reason: errorReason(error) };
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
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: errorReason(error) };
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
        // Best-effort — file may not exist. A leftover file can only make a later timer escalate sooner.
      }
    },
  };
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
