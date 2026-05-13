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

export interface GitHubGraphQlError {
  message: string;
}

export interface GraphQlResult<T = unknown> {
  data: T;
  rateLimit?: RateLimitInfo;
  retryAfterSeconds?: number;
  errors?: GitHubGraphQlError[];
}

async function graphqlInner<T>(
  query: string,
  vars: Record<string, unknown>,
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

  const parsed = (await res.json()) as { data: T | null; errors?: GitHubGraphQlError[] };
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
    const messages = (parsed.errors ?? []).map((e) => e.message).join("; ");
    throw new GitHubRequestError(`GitHub GraphQL error (no data): ${messages}`, {
      status: res.status,
      rateLimit: rateLimit ?? undefined,
      retryAfterSeconds,
    });
  }
  if (parsed.errors?.length) {
    const messages = parsed.errors.map((e) => e.message).join("; ");
    process.stderr.write(`pr-shepherd: GraphQL non-fatal errors: ${messages}\n`);
  }

  return { data: parsed.data, rateLimit, retryAfterSeconds, errors: parsed.errors };
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
  const { data, rateLimit, retryAfterSeconds, errors } = await graphqlInner<T>(query, vars);
  return { data, rateLimit: rateLimit ?? undefined, retryAfterSeconds, errors };
}
