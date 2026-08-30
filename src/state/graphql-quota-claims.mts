import { mkdir, open, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { GraphqlQuotaWarning } from "../types.mts";

export async function claimWarning(
  path: string,
  warning: GraphqlQuotaWarning,
  now: number,
  rearmEpoch: number,
): Promise<boolean> {
  const claimsDir = `${path}.claims`;
  const claimPath = join(
    claimsDir,
    `${warning.resetAt}-${warning.limit}-${warning.thresholdPercent}-${rearmEpoch}.json`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await mkdir(claimsDir, { recursive: true });
    await sweepStaleClaims(claimsDir, now);
    handle = await open(claimPath, "wx");
    await handle.writeFile(
      JSON.stringify({
        resource: warning.resource,
        resetAt: warning.resetAt,
        thresholdPercent: warning.thresholdPercent,
        rearmEpoch,
      }),
      "utf8",
    );
    return true;
  } catch (error) {
    // When state storage is unavailable, surfacing the warning is safer than
    // silently exhausting the credential. EEXIST alone means another process
    // racing for this exact re-arm epoch already won the claim — a claim
    // left over from an earlier epoch (e.g. before a credential switch) has
    // a different filename and never collides here, so a re-armed warning
    // is never suppressed by a stale epoch's claim.
    return !isAlreadyExists(error);
  } finally {
    try {
      await handle?.close();
    } catch {
      // Best-effort claim cleanup is unnecessary: existence is the claim.
    }
  }
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
