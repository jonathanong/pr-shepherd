/**
 * Ready-delay state machine for the shepherd iterate loop.
 *
 * When all READY conditions hold, shepherd writes a `ready-since.txt` marker
 * bound to the PR head to the state dir. The loop continues until the PR has
 * been READY on that head for `readyDelaySeconds` consecutively. Any not-READY
 * result, or a different head, resets the timer. An elapsed marker stays until
 * the caller consumes it with `clearReadyDelay`.
 */

import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "../state/base.mts";

// ---------------------------------------------------------------------------
// Ready-delay state machine
// ---------------------------------------------------------------------------

interface ReadyDelayState {
  isReady: boolean;
  /**
   * When true, the loop should cancel itself — the PR has been READY for
   * longer than the configured ready-delay.
   */
  shouldCancel: boolean;
  /** How many seconds remain in the ready-delay. */
  remainingSeconds: number;
}

/**
 * Update the ready-delay state machine and return the current decision.
 *
 * Call this at the end of each sweep iteration:
 *   - If `isReady == true`: start or continue the ready timer.
 *   - If `isReady == false`: reset the timer.
 *
 * When `shouldCancel == true`, the formatter tells loop-capable agents to cancel
 * the loop and tells one-shot agents to stop.
 */
export async function updateReadyDelay(
  prNumber: number,
  isReady: boolean,
  readyDelaySeconds: number,
  owner: string,
  repo: string,
  options: { headSha: string; alreadyElapsed?: boolean },
): Promise<ReadyDelayState> {
  const markerPath = readySincePath(prNumber, owner, repo);

  if (!isReady) {
    // Reset the timer.
    await safeUnlink(markerPath);
    return { isReady: false, shouldCancel: false, remainingSeconds: readyDelaySeconds };
  }

  // Durable evidence (a current READY receipt) already proves the delay
  // elapsed for this exact state, so a re-poll must not start a fresh timer.
  if (options.alreadyElapsed) {
    return { isReady: true, shouldCancel: true, remainingSeconds: 0 };
  }

  // PR is READY — check or create the marker.
  const now = Math.floor(Date.now() / 1000);
  let readySince = await readReadySince(markerPath, options.headSha);
  // Reset if the marker is missing, names another head, is not finite, or is
  // in the future (clock skew, corrupted file, or manual edit). A future
  // timestamp would produce a negative elapsed value and an inflated
  // remainingSeconds.
  if (readySince === null || readySince > now) {
    readySince = now;
    await safeWriteFile(markerPath, `${now} ${options.headSha}`);
  }

  const elapsed = now - readySince;
  const remaining = readyDelaySeconds - elapsed;

  if (remaining <= 0) {
    return { isReady: true, shouldCancel: true, remainingSeconds: 0 };
  }

  return { isReady: true, shouldCancel: false, remainingSeconds: remaining };
}

/** Delete the ready-delay marker once an elapsed delay has been consumed. */
export async function clearReadyDelay(
  prNumber: number,
  owner: string,
  repo: string,
): Promise<void> {
  await safeUnlink(readySincePath(prNumber, owner, repo));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readySincePath(pr: number, owner: string, repo: string): string {
  return resolvePrStatePath({ owner, repo, pr }, "ready-since.txt");
}

/** The marker's start time, or null when it is missing, malformed, or bound to another head. */
async function readReadySince(path: string, headSha: string): Promise<number | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  const [since, head] = raw.trim().split(" ");
  const readySince = Number(since);
  return head === headSha && Number.isSafeInteger(readySince) ? readySince : null;
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
