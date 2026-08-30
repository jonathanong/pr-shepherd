export interface ResolveRateLimitStop {
  message: string;
  retryAfterSeconds?: number;
  limit?: number;
  used?: number;
  remaining?: number;
  resetAt?: number;
  resource?: string;
}

export function rateLimitFromError(
  err: unknown,
  fallbackMessage: string,
): ResolveRateLimitStop | null {
  const maybe = err as {
    status?: unknown;
    rateLimit?: {
      remaining?: unknown;
      limit?: unknown;
      used?: unknown;
      resetAt?: unknown;
      resource?: unknown;
    };
    retryAfterSeconds?: unknown;
  };
  const message = err instanceof Error ? err.message : fallbackMessage;
  const status = finiteNumber(maybe.status);
  const hasRateLimitStatus = status === 403 || status === 429;
  if (
    !isRateLimitMessage(message) &&
    !(hasRateLimitStatus && maybe.retryAfterSeconds !== undefined) &&
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
    rateLimit?: {
      remaining?: unknown;
      limit?: unknown;
      used?: unknown;
      resetAt?: unknown;
      resource?: unknown;
    };
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
    rateLimit?: {
      remaining?: unknown;
      limit?: unknown;
      used?: unknown;
      resetAt?: unknown;
      resource?: unknown;
    };
    retryAfterSeconds?: unknown;
  },
): ResolveRateLimitStop {
  const stop: ResolveRateLimitStop = { message };
  const retryAfterSeconds = finiteNumber(meta.retryAfterSeconds);
  const remaining = finiteNumber(meta.rateLimit?.remaining);
  const limit = finiteNumber(meta.rateLimit?.limit);
  const used = finiteNumber(meta.rateLimit?.used);
  const resetAt = finiteNumber(meta.rateLimit?.resetAt);
  const resource =
    typeof meta.rateLimit?.resource === "string" ? meta.rateLimit.resource : undefined;
  if (retryAfterSeconds !== undefined) stop.retryAfterSeconds = retryAfterSeconds;
  if (limit !== undefined) stop.limit = limit;
  if (used !== undefined) stop.used = used;
  if (remaining !== undefined) stop.remaining = remaining;
  if (resetAt !== undefined) stop.resetAt = resetAt;
  if (resource !== undefined) stop.resource = resource;
  return stop;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isRateLimitMessage(message: string): boolean {
  return /rate limit|rate-limit|secondary limit|secondary rate/i.test(message);
}
