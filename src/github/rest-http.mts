import { appendEntry, nextEntry } from "../log/log-file.mts";
import { formatRequestEntry, formatResponseEntry } from "../log/session.mts";
import { GitHubRequestError } from "./errors.mts";
import { makeHeaders } from "./http-auth.mts";
import { requestWithTokenRetry } from "./http-request.mts";
import {
  parseRateLimit,
  parseRetryAfter,
  redactToken,
  sanitizeBody,
  type RateLimitInfo,
} from "./http-utils.mts";

const BASE_URL = "https://api.github.com";
const SAFE_GITHUB_REST_PATH = /^\/(?!\/)(?!.*(?:\.\.|:\/\/))[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*$/;

function githubApiUrl(path: string): string {
  if (!SAFE_GITHUB_REST_PATH.test(path)) {
    throw new Error(`Invalid GitHub REST path: ${path}`);
  }
  const url = new URL(path, `${BASE_URL}/`);
  if (url.origin !== BASE_URL) {
    throw new Error(`Invalid GitHub REST URL origin: ${url.origin}`);
  }
  return url.href;
}

export interface RestResult<T = unknown> {
  data: T;
  rateLimit?: RateLimitInfo;
}

export async function rest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = await restWithRateLimit<T>(method, path, body);
  return data;
}

export async function restWithRateLimit<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<RestResult<T>> {
  const url = githubApiUrl(path);
  const n = nextEntry();
  appendEntry(formatRequestEntry({ n, kind: "REST", method, url, body }));
  const t0 = performance.now();

  const { res, attempt, retryT0 } = await requestWithTokenRetry(
    async () =>
      fetch(url, {
        method,
        headers: await makeHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    t0,
    (status, durationMs) =>
      appendEntry(formatResponseEntry({ n, kind: "REST", method, url, status, durationMs })),
  );

  const durationMs = Math.round(performance.now() - retryT0);
  const ct = res.headers.get("content-type") ?? "";
  const rateLimit = parseRateLimit(res.headers) ?? undefined;

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
      }),
    );
    throw new GitHubRequestError(
      `GitHub REST ${method} ${path} failed: ${res.status} ${sanitizeBody(text)}`,
      {
        status: res.status,
        rateLimit,
        retryAfterSeconds: parseRetryAfter(res.headers),
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
      }),
    );
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
    }),
  );
  return { data: undefined as T, rateLimit };
}
