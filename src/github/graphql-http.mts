import { appendEntry, nextEntry } from "../log/log-file.mts";
import { formatRequestEntry, formatResponseEntry } from "../log/session.mts";
import { GitHubRequestError, type GitHubGraphQlError } from "./errors.mts";
import { formatGraphQlErrors, parseGraphQlPayload } from "./graphql-response.mts";
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

interface GraphQlResult<T = unknown> {
  data: T;
  rateLimit?: RateLimitInfo;
  retryAfterSeconds?: number;
  errors?: GitHubGraphQlError[];
}

export interface GraphQlRequestOptions {
  /**
   * Mutation batches use partial GraphQL data to preserve per-alias successes.
   * Read paths must keep the strict default so incomplete snapshots never drive
   * PR state transitions.
   */
  allowPartialData?: boolean;
}

async function graphqlInner<T>(
  query: string,
  vars: Record<string, unknown>,
  opts: GraphQlRequestOptions,
): Promise<{
  data: T;
  rateLimit: RateLimitInfo | null;
  retryAfterSeconds: number | undefined;
  errors: GitHubGraphQlError[] | undefined;
}> {
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
    (status, durationMs) =>
      appendEntry(
        formatResponseEntry({ n, kind: "GraphQL", method: "POST", url, status, durationMs }),
      ),
  );

  const durationMs = Math.round(performance.now() - retryT0);
  const rateLimit = parseRateLimit(res.headers);
  const retryAfterSeconds = parseRetryAfter(res.headers);

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
    throw new GitHubRequestError(
      `GitHub GraphQL request failed: ${res.status} ${sanitizeBody(body)}`,
      { status: res.status, rateLimit: rateLimit ?? undefined, retryAfterSeconds },
    );
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch (err) {
    const detail = err instanceof Error ? `: ${err.message}` : "";
    appendEntry(
      formatResponseEntry({
        n,
        kind: "GraphQL",
        method: "POST",
        url,
        status: res.status,
        durationMs,
        textBody: `Invalid JSON response${detail}`,
        attempt: attempt > 1 ? attempt : undefined,
      }),
    );
    throw new GitHubRequestError(`GitHub GraphQL response was not valid JSON${detail}`, {
      status: res.status,
      rateLimit: rateLimit ?? undefined,
      retryAfterSeconds,
    });
  }
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

  const payload = parseGraphQlPayload<T>(parsed, res.status, rateLimit, retryAfterSeconds);
  if (payload.data == null) {
    const detail = formatGraphQlErrors(payload.errors);
    throw new GitHubRequestError(`GitHub GraphQL error (no data)${detail ? `: ${detail}` : ""}`, {
      status: res.status,
      rateLimit: rateLimit ?? undefined,
      retryAfterSeconds,
      graphqlErrors: payload.errors,
    });
  }
  if (payload.errors?.length && !opts.allowPartialData) {
    throw new GitHubRequestError(`GitHub GraphQL error: ${formatGraphQlErrors(payload.errors)}`, {
      status: res.status,
      rateLimit: rateLimit ?? undefined,
      retryAfterSeconds,
      graphqlErrors: payload.errors,
    });
  }
  if (payload.errors?.length) {
    const messages = payload.errors.map((e) => e.message).join("; ");
    process.stderr.write(`pr-shepherd: GraphQL non-fatal errors: ${messages}\n`);
  }

  return { data: payload.data, rateLimit, retryAfterSeconds, errors: payload.errors };
}

export async function graphql<T = unknown>(
  query: string,
  vars: Record<string, unknown> = {},
  opts: GraphQlRequestOptions = {},
): Promise<GraphQlResult<T>> {
  const { data, errors } = await graphqlInner<T>(query, vars, opts);
  return { data, errors };
}

export async function graphqlWithRateLimit<T = unknown>(
  query: string,
  vars: Record<string, unknown> = {},
  opts: GraphQlRequestOptions = {},
): Promise<GraphQlResult<T>> {
  const { data, rateLimit, retryAfterSeconds, errors } = await graphqlInner<T>(query, vars, opts);
  return { data, rateLimit: rateLimit ?? undefined, retryAfterSeconds, errors };
}
