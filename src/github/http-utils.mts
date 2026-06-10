const TRANSPORT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

export function isTransportError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code && TRANSPORT_ERROR_CODES.has(code)) return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const causeCode = (cause as NodeJS.ErrnoException).code;
    if (causeCode && TRANSPORT_ERROR_CODES.has(causeCode)) return true;
  }
  return false;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: number;
}

export function sanitizeBody(body: string): string {
  return body.replace(/Bearer\s+\S+/gi, "[REDACTED]").slice(0, 200);
}

export function redactToken(body: string): string {
  return body.replace(/Bearer\s+\S+/gi, "[REDACTED]");
}

export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export function parseRateLimit(headers: Headers): RateLimitInfo | null {
  const rRaw = headers.get("x-ratelimit-remaining");
  const lRaw = headers.get("x-ratelimit-limit");
  const tRaw = headers.get("x-ratelimit-reset");
  if (rRaw === null || lRaw === null || tRaw === null) return null;
  const remaining = Number(rRaw);
  const limit = Number(lRaw);
  const resetAt = Number(tRaw);
  if (Number.isFinite(remaining) && Number.isFinite(limit) && Number.isFinite(resetAt)) {
    return { remaining, limit, resetAt };
  }
  return null;
}

export function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  const seconds = Number(raw);
  return raw !== null && Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
