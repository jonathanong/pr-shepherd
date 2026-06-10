import { clearTokenCache, hasCachedToken } from "./http-auth.mts";
import { isTransportError } from "./http-utils.mts";
import { sleep } from "../util/sleep.mts";

type RetryLogFn = (status: number, durationMs: number) => void;

const TRANSPORT_RETRY_DELAYS = [250, 500];

async function fetchWithTransportRetry(fn: () => Promise<Response>): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= TRANSPORT_RETRY_DELAYS.length + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransportError(err)) throw err;
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
): Promise<{ res: Response; attempt: number; retryT0: number }> {
  const res = await fetchWithTransportRetry(fn);
  if (res.status === 401 && hasCachedToken()) {
    onIntermediate?.(401, Math.round(performance.now() - t0));
    try {
      await res.arrayBuffer();
    } catch {}
    clearTokenCache();
    const retryT0 = performance.now();
    return { res: await fetchWithTransportRetry(fn), attempt: 2, retryT0 };
  }
  return { res, attempt: 1, retryT0: t0 };
}
