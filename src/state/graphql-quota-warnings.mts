import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GraphqlQuotaWarningBand } from "../config/load.mts";
import type { GraphqlQuotaWarning, GraphqlApiUsage } from "../types.mts";
import { resolveStateBase } from "./base.mts";
import { SAFE_SEGMENT } from "../util/path-segment.mts";
import { getWorktreeKey } from "../util/worktree.mts";
import {
  evaluateGraphqlQuotaWarning,
  type GraphqlQuotaWarningState,
} from "./graphql-quota-policy.mts";

export async function evaluateWorktreeGraphqlQuotaWarning(
  key: { owner: string; repo: string },
  bands: GraphqlQuotaWarningBand[],
  sample: GraphqlApiUsage,
  persist: boolean,
): Promise<GraphqlQuotaWarning | undefined> {
  if (bands.length === 0) return undefined;
  const path = await warningStatePath(key);
  const previous = await readState(path);
  const evaluated = evaluateGraphqlQuotaWarning(bands, sample, previous);
  if (persist) await writeState(path, evaluated.state);
  return evaluated.warning;
}

async function warningStatePath(key: { owner: string; repo: string }): Promise<string> {
  if (!SAFE_SEGMENT.test(key.owner) || !SAFE_SEGMENT.test(key.repo)) {
    throw new Error(`Invalid repo key segments: ${key.owner}/${key.repo}`);
  }
  const worktreeKey = await getWorktreeKey();
  return join(
    resolveStateBase(),
    `${key.owner}-${key.repo}`,
    "worktrees",
    `${worktreeKey}-graphql-quota-warnings.json`,
  );
}

async function readState(path: string): Promise<GraphqlQuotaWarningState | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as GraphqlQuotaWarningState;
    if (
      typeof parsed.resource !== "string" ||
      !Number.isFinite(parsed.limit) ||
      !Number.isFinite(parsed.lastRemaining) ||
      !Number.isFinite(parsed.resetAt) ||
      !Array.isArray(parsed.warnedThresholds)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeState(path: string, state: GraphqlQuotaWarningState): Promise<void> {
  let tmp: string | undefined;
  try {
    await mkdir(dirname(path), { recursive: true });
    tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(state), "utf8");
    await rename(tmp, path);
    tmp = undefined;
  } catch {
    // Best-effort warning state must never fail the command.
  } finally {
    if (tmp !== undefined) {
      try {
        await unlink(tmp);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}
