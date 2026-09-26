/**
 * One close/reopen of a head that was missing required checks.
 *
 * `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/<pr>/ci-retrigger.json`
 * Reopening does not change the head SHA, so the next tick must not close the PR again.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";

interface Retrigger {
  headSha: string;
  contexts: string[];
}

/** The stored head and context set, or undefined when no usable marker exists. */
export async function readCiRetrigger(key: {
  owner: string;
  repo: string;
  pr: number;
}): Promise<Retrigger | undefined> {
  return readRetrigger(resolvePrStatePath(key, "ci-retrigger.json"));
}

/** Remember that this head was already closed and reopened for these contexts. */
export async function writeCiRetrigger(
  key: { owner: string; repo: string; pr: number },
  record: Retrigger,
): Promise<void> {
  const path = resolvePrStatePath(key, "ci-retrigger.json");
  await mkdir(dirname(path), { recursive: true });
  const next: Retrigger = {
    headSha: record.headSha,
    contexts: [...record.contexts].sort(),
  };
  await writeFile(path, JSON.stringify(next));
}

/** True when this head was already retriggered for the same required contexts. */
export function sameCiRetrigger(
  record: Retrigger | undefined,
  headSha: string,
  contexts: readonly string[],
): boolean {
  if (!record || record.headSha !== headSha) return false;
  const stored = [...record.contexts].sort();
  const current = [...contexts].sort();
  return stored.length === current.length && stored.every((name, index) => name === current[index]);
}

async function readRetrigger(path: string): Promise<Retrigger | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (parsed === null || typeof parsed !== "object") return undefined;
    const headSha = (parsed as { headSha?: unknown }).headSha;
    const contexts = (parsed as { contexts?: unknown }).contexts;
    if (typeof headSha !== "string" || !Array.isArray(contexts)) return undefined;
    if (!contexts.every((name) => typeof name === "string")) return undefined;
    return { headSha, contexts };
  } catch {
    return undefined;
  }
}
