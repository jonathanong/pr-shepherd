import { readFile } from "node:fs/promises";
import { mkdir, unlink, writeFile } from "./guarded-fs.mts";
import { dirname } from "node:path";
import { resolveStackStatePath } from "./base.mts";

/**
 * The open layers a stack merge request covered when it was first seen. A layer that appears later
 * was never approved. Keyed by repo, native stack number, and merge scope, and bound to the one
 * request that wrote it: the record stores that request's command line and write time, and is
 * ignored once the command line differs (a new explicit request is a fresh approval) or the
 * record is older than {@link APPROVAL_TTL_MS}.
 *
 * State lives in `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/stack-<number>/merge-approval-<scope>.json`.
 * `admin clean stack <number>` removes it.
 */
export interface StackMergeApprovalKey {
  owner: string;
  repo: string;
  stack: number;
  /** `all`, `ready`, or `through-<pr>`. */
  scope: string;
}

/** How long one request's approval lasts; a request outliving it is approved afresh. */
const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

function approvalPath(key: StackMergeApprovalKey): string {
  return resolveStackStatePath(key, `merge-approval-${key.scope}.json`);
}

/**
 * The recorded layer numbers, or null when none were recorded for this request: no file, an
 * unusable file, another request's command line, or an expired record.
 */
export async function readApprovedLayers(
  key: StackMergeApprovalKey,
  command: string,
  now = Date.now(),
): Promise<number[] | null> {
  try {
    const parsed = JSON.parse(await readFile(approvalPath(key), "utf8")) as {
      layers?: unknown;
      command?: unknown;
      writtenAt?: unknown;
    };
    const { layers, writtenAt } = parsed;
    if (parsed.command !== command || typeof writtenAt !== "number") return null;
    const age = now - writtenAt;
    if (!(age >= 0 && age <= APPROVAL_TTL_MS)) return null;
    return Array.isArray(layers) && layers.every((layer) => Number.isSafeInteger(layer))
      ? (layers as number[])
      : null;
  } catch {
    return null;
  }
}

/** Record the layers a merge request covered. A write failure surfaces: it must not fail open. */
export async function writeApprovedLayers(
  key: StackMergeApprovalKey,
  layers: number[],
  command: string,
  now = Date.now(),
): Promise<void> {
  const path = approvalPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ layers, command, writtenAt: now })}\n`, "utf8");
}

/** Forget the record once every covered layer has merged, so a later request starts fresh. */
export async function clearApprovedLayers(key: StackMergeApprovalKey): Promise<void> {
  await unlink(approvalPath(key)).catch(() => undefined);
}
