import { clearTokenCache, hasCachedToken } from "./http-auth.mts";

type RetryLogFn = (status: number, durationMs: number) => void;

export async function requestWithTokenRetry(
  fn: () => Promise<Response>,
  t0: number,
  onIntermediate?: RetryLogFn,
): Promise<{ res: Response; attempt: number; retryT0: number }> {
  const res = await fn();
  if (res.status === 401 && hasCachedToken()) {
    onIntermediate?.(401, Math.round(performance.now() - t0));
    try {
      await res.arrayBuffer();
    } catch {}
    clearTokenCache();
    const retryT0 = performance.now();
    return { res: await fn(), attempt: 2, retryT0 };
  }
  return { res, attempt: 1, retryT0: t0 };
}
