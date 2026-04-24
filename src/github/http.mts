import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

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

  if (process.env["GH_TOKEN"]) {
    _token = process.env["GH_TOKEN"];
    return _token;
  }
  if (process.env["GITHUB_TOKEN"]) {
    _token = process.env["GITHUB_TOKEN"];
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

async function requestWithTokenRetry(fn: () => Promise<Response>): Promise<Response> {
  const res = await fn();
  if (res.status === 401 && _token !== undefined) {
    try { await res.arrayBuffer(); } catch { /* best-effort drain */ }
    _token = undefined;
    return fn();
  }
  return res;
}

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

async function graphqlInner<T>(
  query: string,
  vars: Record<string, unknown>,
): Promise<{ data: T; rateLimit: RateLimitInfo | null }> {
  const res = await requestWithTokenRetry(async () =>
    fetch(`${BASE_URL}/graphql`, {
      method: "POST",
      headers: await makeHeaders(),
      body: JSON.stringify({ query, variables: vars }),
    }),
  );

  const rateLimit = parseRateLimit(res.headers);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub GraphQL request failed: ${res.status} ${sanitizeBody(body)}`);
  }

  const parsed = (await res.json()) as { data: T | null; errors?: Array<{ message: string }> };

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
  const res = await requestWithTokenRetry(async () =>
    fetch(`${BASE_URL}${path}`, {
      method,
      headers: await makeHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub REST ${method} ${path} failed: ${res.status} ${sanitizeBody(text)}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return undefined as T;
}

export async function restText(path: string): Promise<string> {
  const res = await requestWithTokenRetry(async () =>
    fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: await makeHeaders(),
      redirect: "manual",
    }),
  );

  if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
    const location = res.headers.get("location");
    if (location) {
      const redirectRes = await fetch(location);
      if (!redirectRes.ok) {
        throw new Error(`redirect target ${location} failed: ${redirectRes.status}`);
      }
      return redirectRes.text();
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub REST GET ${path} failed: ${res.status} ${sanitizeBody(text)}`);
  }

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
