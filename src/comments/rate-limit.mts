export interface ResolveRateLimitStop {
  message: string;
  retryAfterSeconds?: number;
  limit?: number;
  remaining?: number;
  resetAt?: number;
}

export function rateLimitFromError(
  err: unknown,
  fallbackMessage: string,
): ResolveRateLimitStop | null {
  const maybe = err as {
    status?: unknown;
    rateLimit?: { remaining?: unknown; limit?: unknown; resetAt?: unknown };
    retryAfterSeconds?: unknown;
  };
  const message = err instanceof Error ? err.message : fallbackMessage;
  if (
    !isRateLimitMessage(message) &&
    maybe.retryAfterSeconds === undefined &&
    maybe.rateLimit?.remaining !== 0
  )
    return null;
  return buildRateLimitStop(message, {
    rateLimit: maybe.rateLimit,
    retryAfterSeconds: maybe.retryAfterSeconds,
  });
}

export function rateLimitFromGraphQlResult(
  messages: string[],
  meta: {
    rateLimit?: { remaining?: unknown; limit?: unknown; resetAt?: unknown };
    retryAfterSeconds?: unknown;
    stopOnZeroRemaining?: boolean;
  },
): ResolveRateLimitStop | undefined {
  const message = messages.find(isRateLimitMessage);
  if (message) return buildRateLimitStop(message, meta);
  if (meta.stopOnZeroRemaining === true && meta.rateLimit?.remaining === 0) {
    return buildRateLimitStop("GitHub GraphQL rate limit remaining is 0", meta);
  }
  return undefined;
}

function buildRateLimitStop(
  message: string,
  meta: {
    rateLimit?: { remaining?: unknown; limit?: unknown; resetAt?: unknown };
    retryAfterSeconds?: unknown;
  },
): ResolveRateLimitStop {
  const stop: ResolveRateLimitStop = { message };
  const retryAfterSeconds = finiteNumber(meta.retryAfterSeconds);
  const remaining = finiteNumber(meta.rateLimit?.remaining);
  const limit = finiteNumber(meta.rateLimit?.limit);
  const resetAt = finiteNumber(meta.rateLimit?.resetAt);
  if (retryAfterSeconds !== undefined) stop.retryAfterSeconds = retryAfterSeconds;
  if (limit !== undefined) stop.limit = limit;
  if (remaining !== undefined) stop.remaining = remaining;
  if (resetAt !== undefined) stop.resetAt = resetAt;
  return stop;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isRateLimitMessage(message: string): boolean {
  return /rate limit|rate-limit|secondary limit|secondary rate/i.test(message);
}
