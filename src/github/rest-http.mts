/* eslint-disable max-lines */
import { appendEntry, nextEntry } from "../log/log-file.mts";
import { formatRequestEntry, formatResponseEntry } from "../log/session.mts";
import { loadEtagEntry, storeEtagEntry, type StateKey } from "../state/rest-cache.mts";
import { GitHubRequestError } from "./errors.mts";
import { makeAuthHeaders } from "./http-auth.mts";
import { requestWithTokenRetry } from "./http-request.mts";
import {
  parseRateLimit,
  parseRetryAfter,
  redactToken,
  sanitizeBody,
  type RateLimitInfo,
} from "./http-utils.mts";
import { recordApiTelemetry } from "./api-telemetry.mts";
import { recordIntermediateResponse } from "./http-intermediate.mts";

const BASE_URL = "https://api.github.com";
const SAFE_GITHUB_REST_PATH = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*$/;

function githubApiUrl(path: string): string {
  if (!SAFE_GITHUB_REST_PATH.test(path) || path.includes("://")) {
    throw new Error(`Invalid GitHub REST path: ${path}`);
  }
  const url = new URL(path, `${BASE_URL}/`);
  if (url.origin !== BASE_URL) {
    throw new Error(`Invalid GitHub REST URL origin: ${url.origin}`);
  }
  const pathname = path.split("?")[0] ?? path;
  if (pathname.split("/").some((seg) => seg === ".." || seg === ".")) {
    throw new Error(`Invalid GitHub REST path: ${path}`);
  }
  return url.href;
}

export interface RestResult<T = unknown> {
  data: T;
  rateLimit?: RateLimitInfo;
}

/**
 * Enables `If-None-Match` conditional requests for a REST call, backed by a
 * per-PR on-disk cache (see `src/state/rest-cache.mts`). A 304 response
 * returns the cached body and — unlike a normal request — does not consume
 * the primary REST rate-limit quota.
 */
export interface RestRequestOptions {
  conditional?: {
    key: StateKey;
    /** Logical cache name; must be unique per distinct resource + page. */
    name: string;
    headSha?: string;
  };
}

export async function rest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = await restWithRateLimit<T>(method, path, body);
  return data;
}

export async function restWithRateLimit<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  opts?: RestRequestOptions,
): Promise<RestResult<T>> {
  const url = githubApiUrl(path);
  const n = nextEntry();
  appendEntry(formatRequestEntry({ n, kind: "REST", method, url, body }));
  const t0 = performance.now();
  let authSource = "unknown";

  const cached = opts?.conditional
    ? await loadEtagEntry(opts.conditional.key, opts.conditional.name)
    : null;

  const { res, attempt, retryT0 } = await requestWithTokenRetry(
    async () => {
      const auth = await makeAuthHeaders(cached ? { "If-None-Match": cached.etag } : undefined);
      authSource = auth.source;
      return fetch(url, {
        method,
        headers: auth.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    },
    t0,
    (response, durationMs) =>
      recordIntermediateResponse({
        n,
        kind: "REST",
        method,
        url,
        response,
        durationMs,
        authSource,
      }),
  );

  const durationMs = Math.round(performance.now() - retryT0);
  const rateLimit = parseRateLimit(res.headers) ?? undefined;
  const retryAfterSeconds = parseRetryAfter(res.headers);

  // A 304 is not `res.ok` but is not an error either — and critically, does
  // not consume the primary REST request quota — so it must be handled
  // before the !res.ok branch below.
  if (res.status === 304 && cached) {
    appendEntry(
      formatResponseEntry({
        n,
        kind: "REST",
        method,
        url,
        status: res.status,
        durationMs,
        attempt: attempt > 1 ? attempt : undefined,
        authSource,
        rateLimit,
        retryAfterSeconds,
      }),
    );
    recordApiTelemetry({ kind: "REST", method, authSource, rateLimit });
    return { data: cached.body as T, rateLimit };
  }

  const ct = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    const text = await res.text();
    appendEntry(
      formatResponseEntry({
        n,
        kind: "REST",
        method,
        url,
        status: res.status,
        durationMs,
        textBody: redactToken(text),
        attempt: attempt > 1 ? attempt : undefined,
        authSource,
        rateLimit,
        retryAfterSeconds,
      }),
    );
    recordApiTelemetry({ kind: "REST", method, authSource, rateLimit });
    throw new GitHubRequestError(
      `GitHub REST ${method} ${path} failed: ${res.status} ${sanitizeBody(text)}`,
      {
        status: res.status,
        rateLimit,
        retryAfterSeconds,
        authSource,
      },
    );
  }

  if (ct.includes("application/json")) {
    const json = (await res.json()) as T;
    appendEntry(
      formatResponseEntry({
        n,
        kind: "REST",
        method,
        url,
        status: res.status,
        durationMs,
        contentType: ct,
        body: json,
        attempt: attempt > 1 ? attempt : undefined,
        authSource,
        rateLimit,
        retryAfterSeconds,
      }),
    );
    recordApiTelemetry({ kind: "REST", method, authSource, rateLimit });
    if (opts?.conditional) {
      const etag = res.headers.get("etag");
      if (etag) {
        await storeEtagEntry(opts.conditional.key, opts.conditional.name, {
          etag,
          body: json,
          ...(opts.conditional.headSha !== undefined && { headSha: opts.conditional.headSha }),
        });
      }
    }
    return { data: json, rateLimit };
  }
  appendEntry(
    formatResponseEntry({
      n,
      kind: "REST",
      method,
      url,
      status: res.status,
      durationMs,
      contentType: ct || undefined,
      attempt: attempt > 1 ? attempt : undefined,
      authSource,
      rateLimit,
      retryAfterSeconds,
    }),
  );
  recordApiTelemetry({ kind: "REST", method, authSource, rateLimit });
  return { data: undefined as T, rateLimit };
}
