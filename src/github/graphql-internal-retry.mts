import { sleep } from "../util/sleep.mts";
import { GitHubRequestError, isRetryableGraphQlInternal } from "./errors.mts";

const GRAPHQL_INTERNAL_RETRY_DELAYS = [500, 1500];

/** True when the root operation is a mutation. Anonymous `{...}` is a query. */
function isGraphQlMutationDocument(document: string): boolean {
  let rest = document;
  for (;;) {
    rest = rest.replace(/^\s+/, "");
    if (rest.startsWith("#")) {
      const nl = rest.indexOf("\n");
      rest = nl === -1 ? "" : rest.slice(nl + 1);
      continue;
    }
    if (rest.startsWith('"""')) {
      const end = rest.indexOf('"""', 3);
      rest = end === -1 ? "" : rest.slice(end + 3);
      continue;
    }
    break;
  }
  return /^mutation\b/i.test(rest);
}

function hasServerBackoff(err: GitHubRequestError): boolean {
  if (err.retryAfterSeconds !== undefined) return true;
  return err.rateLimit !== undefined && err.rateLimit.remaining <= 0;
}

/** Retry GitHub GraphQL engine crashes (HTTP 200, data: null, INTERNAL) on reads. */
export async function withGraphQlInternalRetry<T>(
  document: string,
  run: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= GRAPHQL_INTERNAL_RETRY_DELAYS.length + 1; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (
        !(err instanceof GitHubRequestError) ||
        !isRetryableGraphQlInternal(err.graphqlErrors) ||
        isGraphQlMutationDocument(document) ||
        hasServerBackoff(err)
      ) {
        throw err;
      }
      lastErr = err;
      const delay = GRAPHQL_INTERNAL_RETRY_DELAYS[attempt - 1];
      if (delay === undefined) break;
      await sleep(delay);
    }
  }
  throw lastErr;
}
