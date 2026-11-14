import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveStackStatePath } from "./base.mts";

/**
 * The open layers a stack merge request covered when it was first seen. A layer that appears later
 * was never approved. Keyed by repo, native stack number, and merge scope.
 *
 * State lives in `$PR_SHEPHERD_STATE_DIR/<owner>/<repo>/stack-<number>/merge-approval-<scope>.json`.
 */
export interface StackMergeApprovalKey {
  owner: string;
  repo: string;
  stack: number;
  /** `all`, or `through-<pr>`. */
  scope: string;
}

function approvalPath(key: StackMergeApprovalKey): string {
  return resolveStackStatePath(key, `merge-approval-${key.scope}.json`);
}

/** The recorded layer numbers, or null when none were recorded or the file is unusable. */
export async function readApprovedLayers(key: StackMergeApprovalKey): Promise<number[] | null> {
  try {
    const parsed = JSON.parse(await readFile(approvalPath(key), "utf8")) as { layers?: unknown };
    const { layers } = parsed;
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
): Promise<void> {
  const path = approvalPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ layers })}\n`, "utf8");
}

/** Forget the record once every covered layer has merged, so a later request starts fresh. */
export async function clearApprovedLayers(key: StackMergeApprovalKey): Promise<void> {
  await unlink(approvalPath(key)).catch(() => undefined);
}
