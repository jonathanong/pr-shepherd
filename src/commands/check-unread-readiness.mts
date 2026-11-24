import type { BatchPrData, ShepherdStatus } from "../types.mts";

/**
 * A snapshot with unreadable (null) nodes cannot prove CI or feedback is clear, so it is never
 * READY: the PR waits and the next tick re-reads it.
 */
export function holdUnreadReadiness(status: ShepherdStatus, data: BatchPrData): ShepherdStatus {
  return status === "READY" && data.unreadNodes ? "PENDING" : status;
}
