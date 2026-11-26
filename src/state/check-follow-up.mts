/**
 * One presented investigation tick for failing checks that have no rerun and no usable evidence.
 *
 * `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/check-follow-up.json`
 * This records that Shepherd returned the investigation instruction for this head and check set,
 * not that the caller ran it. The next presented tick with the same head and checks escalates.
 * Internal debounce preview ticks do not write this marker.
 */

import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "./guarded-fs.mts";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";

interface CheckFollowUpMarker {
  headSha: string;
  checks: string[];
}

interface StateKey {
  owner: string;
  repo: string;
  pr: number;
}

/**
 * Stable identity for a failing check: name, run, attempt, queue commit, and (for a status with no
 * run) its details URL, so a fresh queue execution or result is not mistaken for an old one.
 * Sorted so order never matters.
 */
export function checkFollowUpKeys(
  checks: ReadonlyArray<{
    name: string;
    runId: string | null;
    runAttempt?: number;
    commitOid?: string;
    detailsUrl?: string | null;
  }>,
): string[] {
  return checks
    .map((c) => {
      const base = `${c.name}#${c.runId ?? ""}#${c.runAttempt ?? ""}`;
      const commit = c.commitOid ? `@${c.commitOid}` : "";
      const url = c.runId === null && c.detailsUrl ? `|${c.detailsUrl}` : "";
      return base + commit + url;
    })
    .sort();
}

/** The stored head and check set, or undefined when no usable marker exists. */
export function readCheckFollowUp(key: StateKey): Promise<CheckFollowUpMarker | undefined> {
  return readMarker(key, "check-follow-up.json");
}

/**
 * The head and failing checks of a still-running workflow run that were already shown, kept in
 * `run-failures-shown.json`. The next presented tick with the same head and checks waits instead.
 */
export function readShownRunFailures(key: StateKey): Promise<CheckFollowUpMarker | undefined> {
  return readMarker(key, "run-failures-shown.json");
}

async function readMarker(key: StateKey, file: string): Promise<CheckFollowUpMarker | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(resolvePrStatePath(key, file), "utf8"));
    if (parsed === null || typeof parsed !== "object") return undefined;
    const { headSha, checks } = parsed as { headSha?: unknown; checks?: unknown };
    if (typeof headSha !== "string" || !Array.isArray(checks)) return undefined;
    if (!checks.every((name) => typeof name === "string")) return undefined;
    return { headSha, checks };
  } catch {
    return undefined;
  }
}

/** Remember that the one investigation instruction was returned for this head and check set. */
export function writeCheckFollowUp(key: StateKey, record: CheckFollowUpMarker): Promise<void> {
  return writeMarker(key, "check-follow-up.json", record);
}

/** Remember that these still-running-run failures were shown for this head. */
export function writeShownRunFailures(key: StateKey, record: CheckFollowUpMarker): Promise<void> {
  return writeMarker(key, "run-failures-shown.json", record);
}

async function writeMarker(
  key: StateKey,
  file: string,
  record: CheckFollowUpMarker,
): Promise<void> {
  try {
    const path = resolvePrStatePath(key, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({ headSha: record.headSha, checks: [...record.checks].sort() }),
    );
  } catch {
    // Best-effort: a missing marker only repeats the one investigation tick.
  }
}

/** True when the investigation instruction was already returned for this head and check set. */
export function sameCheckFollowUp(
  record: CheckFollowUpMarker | undefined,
  headSha: string,
  checks: readonly string[],
): boolean {
  if (!record || record.headSha !== headSha) return false;
  const stored = [...record.checks].sort();
  const current = [...checks].sort();
  return stored.length === current.length && stored.every((key, index) => key === current[index]);
}
