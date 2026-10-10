import { appendEntry, nextEntry } from "../log/log-file.mts";
import { formatRequestEntry, formatResponseEntry } from "../log/session.mts";
import { GitHubRequestError } from "./errors.mts";
import { githubFetch } from "./github-fetch.mts";
import { makeAuthHeaders } from "./http-auth.mts";
import { requestWithTokenRetry } from "./http-request.mts";
import {
  parseRateLimit,
  parseRetryAfter,
  redactUrl,
  sanitizeBody,
  type RateLimitInfo,
} from "./http-utils.mts";
import { recordApiTelemetry } from "./api-telemetry.mts";
import { recordIntermediateResponse } from "./http-intermediate.mts";

const BASE_URL = "https://api.github.com";

export async function restText(
  path: string,
  onRateLimit?: (rateLimit?: RateLimitInfo) => void,
): Promise<string> {
  const url = `${BASE_URL}${path}`;
  const n = nextEntry();
  appendEntry(formatRequestEntry({ n, kind: "restText", method: "GET", url }));
  const t0 = performance.now();
  let authSource = "unknown";
  let credentialFingerprint: string | undefined;

  const { res, attempt, retryT0 } = await requestWithTokenRetry(
    async () => {
      const auth = await makeAuthHeaders();
      authSource = auth.source;
      credentialFingerprint = auth.fingerprint;
      return githubFetch(url, { method: "GET", headers: auth.headers, redirect: "manual" });
    },
    t0,
    (response, durationMs) =>
      recordIntermediateResponse({
        n,
        kind: "restText",
        method: "GET",
        url,
        response,
        durationMs,
        authSource,
        credentialFingerprint,
      }),
  );

  const durationMs = Math.round(performance.now() - retryT0);
  const rateLimit = parseRateLimit(res.headers) ?? undefined;
  onRateLimit?.(rateLimit);
  const retryAfterSeconds = parseRetryAfter(res.headers);
  recordApiTelemetry({ kind: "REST", method: "GET", authSource, credentialFingerprint, rateLimit });
  if ([301, 302, 307, 308].includes(res.status)) {
    const redirected = await followRestTextRedirect(res, {
      n,
      url,
      durationMs,
      attempt,
      authSource,
      rateLimit,
      retryAfterSeconds,
    });
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
        authSource,
        rateLimit,
        retryAfterSeconds,
      }),
    );
    throw new GitHubRequestError(
      `GitHub REST GET ${path} failed: ${res.status} ${sanitizeBody(text)}`,
      {
        status: res.status,
        rateLimit,
        retryAfterSeconds,
        authSource,
        responseMessage: sanitizeBody(text),
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
      authSource,
      rateLimit,
      retryAfterSeconds,
    }),
  );
  return res.text();
}

async function followRestTextRedirect(
  res: Response,
  entry: {
    n: number;
    url: string;
    durationMs: number;
    attempt: number;
    authSource: string;
    rateLimit?: import("./http-utils.mts").RateLimitInfo;
    retryAfterSeconds?: number;
  },
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
      authSource: entry.authSource,
      rateLimit: entry.rateLimit,
      retryAfterSeconds: entry.retryAfterSeconds,
    }),
  );
  const location = res.headers.get("location");
  if (!location) return null;

  const n2 = nextEntry();
  const logUrl = redactUrl(location);
  appendEntry(formatRequestEntry({ n: n2, kind: "restText", method: "GET", url: logUrl }));
  const t1 = performance.now();
  const redirectRes = await githubFetch(location);
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
      responseMessage: "",
    });
  }
  return redirectRes.text();
}

function parseContentLength(headers: Headers): number | undefined {
  const raw = headers.get("content-length");
  return raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
}
