import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
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

const pendingStateUpdates = new Map<string, Promise<void>>();
const sessionStates = new Map<string, GraphqlQuotaWarningState>();

export async function evaluateWorktreeGraphqlQuotaWarning(
  key: { owner: string; repo: string },
  bands: GraphqlQuotaWarningBand[],
  sample: GraphqlApiUsage,
  persist: boolean,
): Promise<GraphqlQuotaWarning | undefined> {
  if (bands.length === 0) return undefined;
  const path = await warningStatePath(key);
  if (path === undefined) {
    const sessionKey = `${key.owner}/${key.repo}`;
    if (!persist) {
      return evaluateGraphqlQuotaWarning(bands, sample, sessionStates.get(sessionKey) ?? null)
        .warning;
    }
    return serializeStateUpdate(`session:${sessionKey}`, async () => {
      const evaluated = evaluateGraphqlQuotaWarning(
        bands,
        sample,
        sessionStates.get(sessionKey) ?? null,
      );
      sessionStates.set(sessionKey, evaluated.state);
      return evaluated.warning;
    });
  }
  if (!persist) {
    const previous = await readState(path);
    return evaluateGraphqlQuotaWarning(bands, sample, previous).warning;
  }

  return serializeStateUpdate(path, async () => {
    const previous = await readState(path);
    const evaluated = evaluateGraphqlQuotaWarning(bands, sample, previous);
    const warning =
      evaluated.warning !== undefined && (await claimWarning(path, evaluated.warning))
        ? evaluated.warning
        : undefined;
    await writeState(path, evaluated.state);
    return warning;
  });
}

async function serializeStateUpdate<T>(key: string, update: () => Promise<T>): Promise<T> {
  const previous = pendingStateUpdates.get(key) ?? Promise.resolve();
  const result = previous.then(update);
  const completion = result.then(
    () => undefined,
    () => undefined,
  );
  pendingStateUpdates.set(key, completion);
  void completion.finally(() => {
    if (pendingStateUpdates.get(key) === completion) {
      pendingStateUpdates.delete(key);
    }
  });
  return result;
}

async function claimWarning(path: string, warning: GraphqlQuotaWarning): Promise<boolean> {
  const claimsDir = `${path}.claims`;
  const claimPath = join(
    claimsDir,
    `${warning.resetAt}-${warning.limit}-${warning.thresholdPercent}.json`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await mkdir(claimsDir, { recursive: true });
    handle = await open(claimPath, "wx");
    await handle.writeFile(
      JSON.stringify({
        resource: warning.resource,
        resetAt: warning.resetAt,
        thresholdPercent: warning.thresholdPercent,
      }),
      "utf8",
    );
    return true;
  } catch (error) {
    // When state storage is unavailable, surfacing the warning is safer than
    // silently exhausting the credential. EEXIST alone means another process won.
    return !isAlreadyExists(error);
  } finally {
    try {
      await handle?.close();
    } catch {
      // Best-effort claim cleanup is unnecessary: existence is the claim.
    }
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}

async function warningStatePath(key: { owner: string; repo: string }): Promise<string | undefined> {
  if (!SAFE_SEGMENT.test(key.owner) || !SAFE_SEGMENT.test(key.repo)) {
    throw new Error(`Invalid repo key segments: ${key.owner}/${key.repo}`);
  }
  let worktreeKey: string;
  try {
    worktreeKey = await getWorktreeKey();
  } catch {
    return undefined;
  }
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
