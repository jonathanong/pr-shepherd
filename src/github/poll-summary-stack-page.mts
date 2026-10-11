import type { RepoInfo } from "./client.mts";
import { GitHubRequestError, isRetryableGraphQlResourceLimit } from "./errors.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { POLL_STACK_SUMMARY_QUERY } from "./queries.mts";
import { MAX_STACK_ENTRIES_PER_PAGE, readStack, type StackRead } from "./stack-read.mts";

/**
 * Read the hydrated stack in pages of at most `stackSize` entries.
 * A wide check matrix can blow GitHub's per-query resource limit on the full
 * page. Halve `first` down to one entry and let `readStack` follow `after`.
 * The shared summary fragment stays intact: one layer is the same shape as an
 * explicit summary, and check hydration still completes windows past 100.
 */
export async function readGraphqlStackSummary(
  anchor: number,
  repo: RepoInfo,
  stackSize: number,
): Promise<StackRead<RawSummaryPr>> {
  let ceiling = MAX_STACK_ENTRIES_PER_PAGE;
  for (;;) {
    const first = Math.max(1, Math.min(stackSize, ceiling));
    try {
      return await readStack<RawSummaryPr>(
        POLL_STACK_SUMMARY_QUERY,
        anchor,
        repo,
        { first },
        ceiling,
      );
    } catch (err) {
      if (
        !(err instanceof GitHubRequestError) ||
        !isRetryableGraphQlResourceLimit(err.graphqlErrors) ||
        first <= 1
      ) {
        throw err;
      }
      ceiling = Math.floor(first / 2);
    }
  }
}
