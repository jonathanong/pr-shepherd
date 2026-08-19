import { appendEntry, nextEntry } from "../log/log-file.mts";
import { formatRequestEntry, formatResponseEntry } from "../log/session.mts";
import { GitHubRequestError } from "./errors.mts";
import { makeHeaders } from "./http-auth.mts";
import { requestWithTokenRetry } from "./http-request.mts";
import { parseRateLimit, parseRetryAfter, redactUrl, sanitizeBody } from "./http-utils.mts";

const BASE_URL = "https://api.github.com";

export async function restText(path: string): Promise<string> {
  const url = `${BASE_URL}${path}`;
  const n = nextEntry();
  appendEntry(formatRequestEntry({ n, kind: "restText", method: "GET", url }));
  const t0 = performance.now();

  const { res, attempt, retryT0 } = await requestWithTokenRetry(
    async () => fetch(url, { method: "GET", headers: await makeHeaders(), redirect: "manual" }),
    t0,
    (status, durationMs) =>
      appendEntry(
        formatResponseEntry({ n, kind: "restText", method: "GET", url, status, durationMs }),
      ),
  );

  const durationMs = Math.round(performance.now() - retryT0);
  if ([301, 302, 307, 308].includes(res.status)) {
    const redirected = await followRestTextRedirect(res, { n, url, durationMs, attempt });
    if (redirected !== null) return redirected;
  }

  if (!res.ok) {
    const text = await res.text();
    appendEntry(
      formatResponseEntry({
        n,
        kind: "restText",
        method: "GET",
        url,
        status: res.status,
        durationMs,
        attempt: attempt > 1 ? attempt : undefined,
      }),
    );
    throw new GitHubRequestError(
      `GitHub REST GET ${path} failed: ${res.status} ${sanitizeBody(text)}`,
      {
        status: res.status,
        rateLimit: parseRateLimit(res.headers) ?? undefined,
        retryAfterSeconds: parseRetryAfter(res.headers),
      },
    );
  }

  appendEntry(
    formatResponseEntry({
      n,
      kind: "restText",
      method: "GET",
      url,
      status: res.status,
      durationMs,
      contentLength: parseContentLength(res.headers),
      attempt: attempt > 1 ? attempt : undefined,
    }),
  );
  return res.text();
}

async function followRestTextRedirect(
  res: Response,
  entry: { n: number; url: string; durationMs: number; attempt: number },
): Promise<string | null> {
  appendEntry(
    formatResponseEntry({
      n: entry.n,
      kind: "restText",
      method: "GET",
      url: entry.url,
      status: res.status,
      durationMs: entry.durationMs,
      attempt: entry.attempt > 1 ? entry.attempt : undefined,
    }),
  );
  const location = res.headers.get("location");
  if (!location) return null;

  const n2 = nextEntry();
  const logUrl = redactUrl(location);
  appendEntry(formatRequestEntry({ n: n2, kind: "restText", method: "GET", url: logUrl }));
  const t1 = performance.now();
  const redirectRes = await fetch(location);
  appendEntry(
    formatResponseEntry({
      n: n2,
      kind: "restText",
      method: "GET",
      url: logUrl,
      status: redirectRes.status,
      durationMs: Math.round(performance.now() - t1),
      contentLength: parseContentLength(redirectRes.headers),
    }),
  );
  if (!redirectRes.ok) {
    throw new GitHubRequestError(`redirect target ${logUrl} failed: ${redirectRes.status}`, {
      status: redirectRes.status,
      rateLimit: parseRateLimit(redirectRes.headers) ?? undefined,
      retryAfterSeconds: parseRetryAfter(redirectRes.headers),
    });
  }
  return redirectRes.text();
}

function parseContentLength(headers: Headers): number | undefined {
  const raw = headers.get("content-length");
  return raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
}
