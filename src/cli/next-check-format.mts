import type { NextCheck } from "../types/next-check.mts";

/** The header line naming the next wake-up, or nothing when none applies. */
export function formatNextCheckLines(next: NextCheck | undefined): string[] {
  if (!next) return [];
  return [`**nextCheck** \`${next.at}\` · in ${next.inSeconds}s · reason \`${next.reason}\``];
}
