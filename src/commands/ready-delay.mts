/**
 * Ready-delay state machine for the shepherd iterate loop.
 *
 * When all READY conditions hold, shepherd writes a `ready-since.txt` marker
 * to the cache dir. The loop continues until the PR has been READY for
 * `readyDelaySeconds` consecutively. Any not-READY result resets the timer.
 */

import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { SAFE_SEGMENT } from "../util/path-segment.mts";

// ---------------------------------------------------------------------------
// Ready-delay state machine
// ---------------------------------------------------------------------------

export interface ReadyDelayState {
  isReady: boolean;
  /**
   * When true, the loop should cancel itself — the PR has been READY for
   * longer than the configured ready-delay.
   */
  shouldCancel: boolean;
  /** How many seconds remain in the ready-delay cooldown. */
  remainingSeconds: number;
}

/**
 * Update the ready-delay state machine and return the current decision.
 *
 * Call this at the end of each sweep iteration:
 *   - If `isReady == true`: start or continue the ready timer.
 *   - If `isReady == false`: reset the timer.
 *
 * When `shouldCancel == true`, the slash command should invoke `/loop cancel`.
 */
export async function updateReadyDelay(
  prNumber: number,
  isReady: boolean,
  readyDelaySeconds: number,
  owner: string,
  repo: string,
): Promise<ReadyDelayState> {
  const markerPath = readySincePath(prNumber, owner, repo);

  if (!isReady) {
    // Reset the timer.
    await safeUnlink(markerPath);
    return { isReady: false, shouldCancel: false, remainingSeconds: readyDelaySeconds };
  }

  // PR is READY — check or create the marker.
  const now = Math.floor(Date.now() / 1000);
  let readySince: number;

  try {
    const raw = await readFile(markerPath, "utf8");
    readySince = parseInt(raw.trim(), 10);
    // Reset if the stored value is not finite or is in the future (clock skew,
    // corrupted file, or manual edit). A future timestamp would produce a
    // negative elapsed value and an inflated remainingSeconds.
    if (!Number.isFinite(readySince) || readySince > now) {
      readySince = now;
      await safeWriteFile(markerPath, String(now));
    }
  } catch {
    // Marker doesn't exist yet — create it.
    readySince = now;
    await safeWriteFile(markerPath, String(now));
  }

  const elapsed = now - readySince;
  const remaining = readyDelaySeconds - elapsed;

  if (remaining <= 0) {
    // Leave the marker in place so future sweeps also return shouldCancel:true
    // until the PR drops out of READY state (which resets via safeUnlink above).
    return { isReady: true, shouldCancel: true, remainingSeconds: 0 };
  }

  return { isReady: true, shouldCancel: false, remainingSeconds: remaining };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readySincePath(pr: number, owner: string, repo: string): string {
  for (const [field, value] of [
    ["owner", owner],
    ["repo", repo],
  ] as const) {
    if (!SAFE_SEGMENT.test(value)) {
      throw new Error(`Invalid path segment "${field}": ${value}`);
    }
  }
  const base = process.env["PR_SHEPHERD_CACHE_DIR"] ?? join(tmpdir(), "pr-shepherd-cache");
  return join(base, `${owner}-${repo}`, String(pr), "ready-since.txt");
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Ignore — file may not exist.
  }
}

async function safeWriteFile(path: string, content: string): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  } catch {
    // Best-effort.
  }
}
