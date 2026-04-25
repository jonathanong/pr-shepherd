import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { appendEntry, nextEntry } from "../log/log-file.mts";
import { formatRequestEntry, formatResponseEntry } from "../log/session.mts";

const execFile = promisify(execFileCb);

const BASE_URL = "https://api.github.com";

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: number;
}

export interface GraphQlResult<T = unknown> {
  data: T;
  rateLimit?: RateLimitInfo;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

let _token: string | undefined;

export function _resetTokenCache(): void {
  _token = undefined;
}

async function resolveToken(): Promise<string> {
  if (_token) return _token;

  const envToken = process.env["GH_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  if (envToken) {
    _token = envToken;
    return _token;
  }

  try {
    const { stdout } = await execFile("gh", ["auth", "token"]);
    const token = stdout.trim();
    if (token) {
      _token = token;
      return _token;
    }
  } catch {
    // fall through to error
  }

  throw new Error("No GitHub token found. Set GH_TOKEN or GITHUB_TOKEN, or run `gh auth login`.");
}

async function makeHeaders(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await resolveToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "pr-shepherd",
    "Content-Type": "application/json",
  };
}

function sanitizeBody(body: string): string {
  return body.replace(/Bearer\s+\S+/gi, "[REDACTED]").slice(0, 200);
}

function redactToken(body: string): string {
  return body.replace(/Bearer\s+\S+/gi, "[REDACTED]");
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

type RetryLogFn = (status: number, durationMs: number) => void;

async function requestWithTokenRetry(
  fn: () => Promise<Response>,
  t0: number,
  onIntermediate?: RetryLogFn,
): Promise<{ res: Response; attempt: number; retryT0: number }> {
  const res = await fn();
  if (res.status === 401 && _token !== undefined) {
    onIntermediate?.(401, Math.round(performance.now() - t0));
    try {
      await res.arrayBuffer();
    } catch {}
    _token = undefined;
    const retryT0 = performance.now();
    return { res: await fn(), attempt: 2, retryT0 };
  }
  return { res, attempt: 1, retryT0: t0 };
}

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

async function graphqlInner<T>(
  query: string,
  vars: Record<string, unknown>,
): Promise<{ data: T; rateLimit: RateLimitInfo | null }> {
  const url = `${BASE_URL}/graphql`;
  const n = nextEntry();
  appendEntry(
    formatRequestEntry({
      n,
      kind: "GraphQL",
      method: "POST",
      url,
      body: { query, variables: vars },
    }),
  );
  const t0 = performance.now();

  const { res, attempt, retryT0 } = await requestWithTokenRetry(
    async () =>
      fetch(url, {
        method: "POST",
        headers: await makeHeaders(),
        body: JSON.stringify({ query, variables: vars }),
      }),
    t0,
    (status, firstDurationMs) => {
      appendEntry(
        formatResponseEntry({
          n,
          kind: "GraphQL",
          method: "POST",
          url,
          status,
          durationMs: firstDurationMs,
        }),
      );
    },
  );

  const durationMs = Math.round(performance.now() - retryT0);
  const rateLimit = parseRateLimit(res.headers);

  if (!res.ok) {
    const body = await res.text();
    appendEntry(
      formatResponseEntry({
        n,
        kind: "GraphQL",
        method: "POST",
        url,
        status: res.status,
        durationMs,
        textBody: redactToken(body),
        attempt: attempt > 1 ? attempt : undefined,
      }),
    );
    throw new Error(`GitHub GraphQL request failed: ${res.status} ${sanitizeBody(body)}`);
  }

  const parsed = (await res.json()) as { data: T | null; errors?: Array<{ message: string }> };
  appendEntry(
    formatResponseEntry({
      n,
      kind: "GraphQL",
      method: "POST",
      url,
      status: res.status,
      durationMs,
      body: parsed,
      attempt: attempt > 1 ? attempt : undefined,
    }),
  );

  if (parsed.data == null) {
    const messages = (parsed.errors ?? []).map((e: { message: string }) => e.message).join("; ");
    throw new Error(`GitHub GraphQL error (no data): ${messages}`);
  }
  if (parsed.errors?.length) {
    const messages = parsed.errors.map((e: { message: string }) => e.message).join("; ");
    process.stderr.write(`pr-shepherd: GraphQL non-fatal errors: ${messages}\n`);
  }

  return { data: parsed.data, rateLimit };
}

export async function graphql<T = unknown>(
  query: string,
  vars: Record<string, unknown> = {},
): Promise<GraphQlResult<T>> {
  const { data } = await graphqlInner<T>(query, vars);
  return { data };
}

export async function graphqlWithRateLimit<T = unknown>(
  query: string,
  vars: Record<string, unknown> = {},
): Promise<GraphQlResult<T>> {
  const { data, rateLimit } = await graphqlInner<T>(query, vars);
  return { data, rateLimit: rateLimit ?? undefined };
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

export async function rest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
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
    (status, firstDurationMs) => {
      appendEntry(
        formatResponseEntry({ n, kind: "REST", method, url, status, durationMs: firstDurationMs }),
      );
    },
  );

  const durationMs = Math.round(performance.now() - retryT0);
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
      }),
    );
    throw new Error(`GitHub REST ${method} ${path} failed: ${res.status} ${sanitizeBody(text)}`);
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
    return json;
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
  return undefined as T;
}

export async function restText(path: string): Promise<string> {
  const url = `${BASE_URL}${path}`;
  const n = nextEntry();
  appendEntry(formatRequestEntry({ n, kind: "restText", method: "GET", url }));
  const t0 = performance.now();

  const { res, attempt, retryT0 } = await requestWithTokenRetry(
    async () =>
      fetch(url, {
        method: "GET",
        headers: await makeHeaders(),
        redirect: "manual",
      }),
    t0,
    (status, firstDurationMs) => {
      appendEntry(
        formatResponseEntry({
          n,
          kind: "restText",
          method: "GET",
          url,
          status,
          durationMs: firstDurationMs,
        }),
      );
    },
  );

  const durationMs = Math.round(performance.now() - retryT0);

  if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
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
    const location = res.headers.get("location");
    if (location) {
      const n2 = nextEntry();
      const logUrl = redactUrl(location);
      appendEntry(formatRequestEntry({ n: n2, kind: "restText", method: "GET", url: logUrl }));
      const t1 = performance.now();
      const redirectRes = await fetch(location);
      const duration2 = Math.round(performance.now() - t1);
      const clRaw = redirectRes.headers.get("content-length");
      const contentLength =
        clRaw !== null && Number.isFinite(Number(clRaw)) ? Number(clRaw) : undefined;
      appendEntry(
        formatResponseEntry({
          n: n2,
          kind: "restText",
          method: "GET",
          url: logUrl,
          status: redirectRes.status,
          durationMs: duration2,
          contentLength,
        }),
      );
      if (!redirectRes.ok) {
        throw new Error(`redirect target ${location} failed: ${redirectRes.status}`);
      }
      return redirectRes.text();
    }
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
    throw new Error(`GitHub REST GET ${path} failed: ${res.status} ${sanitizeBody(text)}`);
  }

  const clRaw = res.headers.get("content-length");
  const contentLength =
    clRaw !== null && Number.isFinite(Number(clRaw)) ? Number(clRaw) : undefined;
  appendEntry(
    formatResponseEntry({
      n,
      kind: "restText",
      method: "GET",
      url,
      status: res.status,
      durationMs,
      contentLength,
      attempt: attempt > 1 ? attempt : undefined,
    }),
  );
  return res.text();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseRateLimit(headers: Headers): RateLimitInfo | null {
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
