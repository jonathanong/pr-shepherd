/** Why a deadline exists even though GitHub events may wake the session first. */
export type NextCheckReason = "ready-delay" | "stall-timeout" | "merge-queue" | "safety-net";

/**
 * Event mode runs one tick, so the caller owns the next wake-up. `at` is an RFC3339 UTC time
 * rounded up to the minute; `inSeconds` is measured from the same instant the tick ran.
 */
export interface NextCheck {
  at: string;
  inSeconds: number;
  /** `safety-net` is a backstop for a missed GitHub event; the others are real deadlines. */
  reason: NextCheckReason;
}
