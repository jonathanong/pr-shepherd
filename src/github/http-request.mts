import { clearTokenCache, hasCachedToken } from "./http-auth.mts";
import { isTransportError } from "./http-utils.mts";
import { sleep } from "../util/sleep.mts";

type RetryLogFn = (response: Response, durationMs: number) => void;

const TRANSPORT_RETRY_DELAYS = [250, 500];

async function fetchWithTransportRetry(
  fn: () => Promise<Response>,
  safeRead: boolean,
  retryServerErrors: boolean,
  onRetry?: RetryLogFn,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= TRANSPORT_RETRY_DELAYS.length + 1; attempt++) {
    try {
      const startedAt = performance.now();
      const response = await fn();
      const delay = TRANSPORT_RETRY_DELAYS[attempt - 1];
      if (safeRead && retryServerErrors && response.status >= 500 && delay !== undefined) {
        onRetry?.(response, Math.round(performance.now() - startedAt));
        try {
          await response.arrayBuffer();
        } catch {}
        await sleep(delay);
        continue;
      }
      return response;
    } catch (err) {
      if (!safeRead || !isTransportError(err)) throw err;
      lastErr = err;
      const delay = TRANSPORT_RETRY_DELAYS[attempt - 1];
      if (delay === undefined) break;
      await sleep(delay);
    }
  }
  throw lastErr;
}

export async function requestWithTokenRetry(
  fn: () => Promise<Response>,
  t0: number,
  onIntermediate?: RetryLogFn,
  safeRead = true,
  retryServerErrors = false,
): Promise<{ res: Response; attempt: number; retryT0: number }> {
  const res = await fetchWithTransportRetry(fn, safeRead, retryServerErrors, onIntermediate);
  if (res.status === 401 && hasCachedToken()) {
    onIntermediate?.(res, Math.round(performance.now() - t0));
    try {
      await res.arrayBuffer();
    } catch {}
    clearTokenCache();
    const retryT0 = performance.now();
    return {
      res: await fetchWithTransportRetry(fn, safeRead, retryServerErrors, onIntermediate),
      attempt: 2,
      retryT0,
    };
  }
  return { res, attempt: 1, retryT0: t0 };
}
