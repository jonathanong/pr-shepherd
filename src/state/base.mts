import { join } from "node:path";
import { tmpdir } from "node:os";
import { SAFE_PR_NUMBER, SAFE_SEGMENT } from "../util/path-segment.mts";

export function resolveStateBase(): string {
  const envDir = process.env["PR_SHEPHERD_STATE_DIR"];
  return envDir ? envDir : join(tmpdir(), "pr-shepherd-state");
}

/**
 * `$PR_SHEPHERD_STATE_DIR/<owner>-<repo>/<pr>/...parts`.
 * Owner, repo, PR number, and each extra part must be a safe path segment.
 */
export function resolvePrStatePath(
  key: { owner: string; repo: string; pr: number },
  ...parts: string[]
): string {
  if (!SAFE_SEGMENT.test(key.owner)) {
    throw new Error(`Invalid state key segment "owner": ${key.owner}`);
  }
  if (!SAFE_SEGMENT.test(key.repo)) {
    throw new Error(`Invalid state key segment "repo": ${key.repo}`);
  }
  const pr = String(key.pr);
  if (!SAFE_PR_NUMBER.test(pr)) {
    throw new Error(`Invalid state key segment "pr": ${key.pr}`);
  }
  for (const part of parts) {
    if (!SAFE_SEGMENT.test(part)) {
      throw new Error(`Invalid state key segment: ${part}`);
    }
  }
  return join(resolveStateBase(), `${key.owner}-${key.repo}`, pr, ...parts);
}
