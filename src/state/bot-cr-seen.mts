/**
 * Persistent first-seen state for bot CHANGES_REQUESTED reviews.
 *
 * Bot CRs are auto-dismissed via `--dismiss-review-ids` in the post-push
 * `resolve:` command. If the agent drops that flag, the bot CR keeps the PR in
 * `CHANGES_REQUESTED` state. This file tracks when each bot CR was first
 * observed so the iterate loop can escalate after `iterate.stallTimeoutMinutes`
 * — independent of the broader fingerprint-based `stall-timeout` mechanism in
 * `iterate-stall.mts` (which only fires when no field of the iterate result
 * changed).
 *
 * State lives in
 * `$TMPDIR/pr-shepherd-state/<owner>-<repo>/<pr>/bot-cr-seen.json`.
 *
 * `bodyHash` lets us reset `firstSeenAt` when the bot re-issues the review
 * with a different body, so a fresh review gets the full timeout window.
 */

import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { SAFE_SEGMENT } from "../util/path-segment.mts";
import { resolveStateBase } from "./base.mts";
import { hashBody } from "./seen-comments.mts";

interface BotCrSeenEntry {
  /** Unix timestamp (seconds) when this review was first observed undismissed. */
  firstSeenAt: number;
  /** SHA-256 body-hash prefix; reset firstSeenAt when this changes. */
  bodyHash: string;
}

export interface BotCrSeenState {
  reviews: Record<string, BotCrSeenEntry>;
}

interface StateKey {
  owner: string;
  repo: string;
  pr: number;
}

export async function readBotCrSeenState(key: StateKey): Promise<BotCrSeenState | null> {
  try {
    const raw = await readFile(resolvePath(key), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return null;
    const reviews = (parsed as Record<string, unknown>)["reviews"];
    if (reviews === null || typeof reviews !== "object" || Array.isArray(reviews)) return null;
    const validated: Record<string, BotCrSeenEntry> = {};
    for (const [id, entry] of Object.entries(reviews as Record<string, unknown>)) {
      if (entry === null || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (typeof e["firstSeenAt"] !== "number" || !Number.isFinite(e["firstSeenAt"])) continue;
      if (typeof e["bodyHash"] !== "string") continue;
      validated[id] = { firstSeenAt: e["firstSeenAt"], bodyHash: e["bodyHash"] };
    }
    return { reviews: validated };
  } catch {
    return null;
  }
}

export async function writeBotCrSeenState(key: StateKey, state: BotCrSeenState): Promise<void> {
  let tmp: string | undefined;
  try {
    const path = resolvePath(key);
    tmp = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tmp, JSON.stringify(state), "utf8");
    await rename(tmp, path);
    tmp = undefined;
  } catch {
    // best-effort
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

/**
 * Update tracked entries against the current set of bot CR reviews:
 * - Insert any new IDs with `firstSeenAt = now` and the current body hash.
 * - Reset `firstSeenAt` for entries whose body hash changed (review re-issued).
 * - Drop entries whose IDs are no longer in the input (review was dismissed
 *   or superseded by an approval).
 *
 * Pure function: returns the next state and the IDs whose age has reached the
 * `stallTimeoutSeconds` threshold (escalate candidates).
 */
export function updateBotCrSeenState(
  previous: BotCrSeenState | null,
  currentBotCrReviews: ReadonlyArray<{ id: string; body: string }>,
  nowSeconds: number,
  stallTimeoutSeconds: number,
): { next: BotCrSeenState; staleIds: string[] } {
  const previousReviews = previous?.reviews ?? {};
  const next: Record<string, BotCrSeenEntry> = {};
  const staleIds: string[] = [];
  for (const r of currentBotCrReviews) {
    const bodyHash = hashBody(r.body);
    const prior = previousReviews[r.id];
    const entry: BotCrSeenEntry =
      prior && prior.bodyHash === bodyHash ? prior : { firstSeenAt: nowSeconds, bodyHash };
    next[r.id] = entry;
    if (stallTimeoutSeconds > 0 && nowSeconds - entry.firstSeenAt >= stallTimeoutSeconds) {
      staleIds.push(r.id);
    }
  }
  return { next: { reviews: next }, staleIds };
}

function resolvePath(key: StateKey): string {
  for (const [field, value] of [
    ["owner", key.owner],
    ["repo", key.repo],
  ] as const) {
    if (!SAFE_SEGMENT.test(value)) {
      throw new Error(`Invalid state key segment "${field}": ${value}`);
    }
  }
  const base = resolveStateBase();
  return join(base, `${key.owner}-${key.repo}`, String(key.pr), "bot-cr-seen.json");
}
