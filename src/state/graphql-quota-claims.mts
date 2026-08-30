import { mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { GraphqlQuotaWarning } from "../types.mts";

// GitHub's GraphQL quota resets hourly, so a claim can never legitimately
// need to suppress a warning for longer than that — this is the hard cap on
// how long a claim is honored even if its window's `resetAt` has not yet
// arrived (e.g. a re-arm from a shared-window credential switch).
const CLAIM_TTL_SECONDS = 3600;

export async function claimWarning(
  path: string,
  warning: GraphqlQuotaWarning,
  now: number,
): Promise<boolean> {
  const claimsDir = `${path}.claims`;
  const claimPath = join(
    claimsDir,
    `${warning.resetAt}-${warning.limit}-${warning.thresholdPercent}.json`,
  );
  const payload = JSON.stringify({
    resource: warning.resource,
    resetAt: warning.resetAt,
    thresholdPercent: warning.thresholdPercent,
    claimedAt: now,
  });

  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await mkdir(claimsDir, { recursive: true });
    await sweepStaleClaims(claimsDir, now);
    handle = await open(claimPath, "wx");
    await handle.writeFile(payload, "utf8");
    return true;
  } catch (error) {
    if (!isAlreadyExists(error)) {
      // When state storage is unavailable, surfacing the warning is safer
      // than silently exhausting the credential.
      return true;
    }
    // Another process already holds this window's claim. Only suppress the
    // warning while that claim is still within its reset window and its own
    // 1-hour timer — otherwise re-claim it so a legitimately re-armed
    // warning (e.g. a shared-window credential switch) is not swallowed.
    if (!(await isClaimStale(claimPath, warning.resetAt, now))) return false;
    return reclaimStaleWarning(claimPath, payload);
  } finally {
    try {
      await handle?.close();
    } catch {
      // Best-effort claim cleanup is unnecessary: existence within the
      // claim's window is what suppresses a warning.
    }
  }
}

async function reclaimStaleWarning(claimPath: string, payload: string): Promise<boolean> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(claimPath, "w");
    await handle.writeFile(payload, "utf8");
    return true;
  } catch {
    // Best-effort re-claim; surfacing the warning is safer than suppressing
    // it if the stale claim can't be overwritten.
    return true;
  } finally {
    try {
      await handle?.close();
    } catch {
      // Best-effort.
    }
  }
}

async function isClaimStale(claimPath: string, resetAt: number, now: number): Promise<boolean> {
  if (now >= resetAt) return true;
  try {
    const parsed = JSON.parse(await readFile(claimPath, "utf8")) as { claimedAt?: unknown };
    if (typeof parsed.claimedAt === "number" && Number.isFinite(parsed.claimedAt)) {
      return now - parsed.claimedAt >= CLAIM_TTL_SECONDS;
    }
  } catch {
    // Legacy or unreadable claim: fall back to reset-time expiry only.
  }
  return false;
}

async function sweepStaleClaims(claimsDir: string, now: number): Promise<void> {
  try {
    const entries = await readdir(claimsDir);
    await Promise.all(
      entries.map(async (entry) => {
        const resetAt = Number(entry.split("-")[0]);
        if (!Number.isFinite(resetAt) || now < resetAt) return;
        try {
          await unlink(join(claimsDir, entry));
        } catch {
          // Best-effort sweep.
        }
      }),
    );
  } catch {
    // Best-effort sweep; a missing or unreadable directory is fine.
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
