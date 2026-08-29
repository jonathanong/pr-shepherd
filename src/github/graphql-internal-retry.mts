import { sleep } from "../util/sleep.mts";
import { GitHubRequestError, isRetryableGraphQlInternal } from "./errors.mts";

const GRAPHQL_INTERNAL_RETRY_DELAYS = [500, 1500];

/** Retry GitHub GraphQL engine crashes (HTTP 200, data: null, INTERNAL). */
export async function withGraphQlInternalRetry<T>(run: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= GRAPHQL_INTERNAL_RETRY_DELAYS.length + 1; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!(err instanceof GitHubRequestError) || !isRetryableGraphQlInternal(err.graphqlErrors)) {
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
