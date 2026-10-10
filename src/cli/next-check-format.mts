import type { NextCheck } from "../types/next-check.mts";

/** ` · **pollMode** \`event\``, or nothing in poll mode. */
export function formatPollModeSegment(result: { pollMode?: "event" }): string {
  return result.pollMode ? ` · **pollMode** \`${result.pollMode}\`` : "";
}

/** The header line naming the next wake-up, or nothing when none applies. */
export function formatNextCheckLines(next: NextCheck | undefined): string[] {
  if (!next) return [];
  const backstop = next.eventDriven ? " · event-driven (a PR event may wake you sooner)" : "";
  return [
    `**nextCheck** \`${next.at}\` · in ${next.inSeconds}s · reason \`${next.reason}\`${backstop}`,
  ];
}
