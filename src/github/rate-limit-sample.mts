import type { RateLimitInfo } from "./http-utils.mts";

/**
 * Same reset window: the lowest remaining and the highest used, taken independently. The Claude
 * Code proxy can answer one tick's routes with `X-RateLimit-Used` values that disagree with each
 * other and with `X-RateLimit-Remaining`, so neither half of one sample is trusted over the other.
 */
export function mostConservativeSample<T extends Pick<RateLimitInfo, "remaining" | "used">>(
  current: T,
  candidate: T,
): T {
  const base = candidate.remaining < current.remaining ? candidate : current;
  const used =
    current.used === undefined || candidate.used === undefined
      ? (current.used ?? candidate.used)
      : Math.max(current.used, candidate.used);
  return { ...base, ...(used !== undefined && { used }) };
}
