/** Exhausted primary limit: time until resetAt, plus 5s, plus `resetAt % 5` seconds. */
const EXHAUSTED_LIMIT_MARGIN_MS = 5_000;

export function exhaustedPrimaryLimitDelayMs(resetAtSeconds: number, nowMs: number): number {
  return (
    Math.max(resetAtSeconds * 1000 - nowMs, 0) +
    EXHAUSTED_LIMIT_MARGIN_MS +
    (resetAtSeconds % 5) * 1000
  );
}
