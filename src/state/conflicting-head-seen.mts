/**
 * When Shepherd first saw a conflicting head that had no CI.
 *
 * `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/conflicting-head.json`
 * GitHub's Commit object has no push timestamp, so the missing-CI grace
 * starts at this observation instead of `committedDate`.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";

interface Seen {
  headSha: string;
  firstSeenAtUnix: number;
}

/** Unix seconds of the first observation of `headSha`, or undefined when state cannot be used. */
export async function conflictingHeadFirstSeenUnix(
  key: { owner: string; repo: string; pr: number },
  headSha: string,
  nowMs: number,
): Promise<number | undefined> {
  const nowUnix = Math.floor(nowMs / 1000);
  try {
    const path = resolvePrStatePath(key, "conflicting-head.json");
    const existing = await readSeen(path);
    if (existing?.headSha === headSha) return existing.firstSeenAtUnix;
    await mkdir(dirname(path), { recursive: true });
    const next: Seen = { headSha, firstSeenAtUnix: nowUnix };
    await writeFile(path, JSON.stringify(next));
    return nowUnix;
  } catch {
    return undefined;
  }
}

async function readSeen(path: string): Promise<Seen | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (parsed === null || typeof parsed !== "object") return undefined;
    const headSha = (parsed as { headSha?: unknown }).headSha;
    const firstSeenAtUnix = (parsed as { firstSeenAtUnix?: unknown }).firstSeenAtUnix;
    if (typeof headSha !== "string" || typeof firstSeenAtUnix !== "number") return undefined;
    if (!Number.isFinite(firstSeenAtUnix)) return undefined;
    return { headSha, firstSeenAtUnix };
  } catch {
    return undefined;
  }
}
