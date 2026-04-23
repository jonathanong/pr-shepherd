/**
 * `shepherd resolve [PR] [flags]`
 *
 * Two modes:
 *
 *   Fetch mode (--fetch or no mutation flags):
 *     Auto-resolves outdated threads and returns all active threads,
 *     visible comments, and CHANGES_REQUESTED reviews for LLM triage.
 *     Sonnet reads this output, applies code fixes, pushes, then calls
 *     resolve in mutation mode to resolve/minimize/dismiss by ID.
 *
 *   Mutation mode (--resolve-thread-ids, --minimize-comment-ids, --dismiss-review-ids):
 *     Resolves/minimizes/dismisses by ID. Optionally verifies the push
 *     has landed on GitHub before mutating (--require-sha).
 */

import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { getOutdatedThreads } from "../comments/outdated.mts";
import { autoResolveOutdated, applyResolveOptions } from "../comments/resolve.mts";
import { loadConfig } from "../config/load.mts";
import { parseSuggestion } from "../suggestions/parse.mts";
import type {
  GlobalOptions,
  ResolveOptions,
  ReviewThread,
  PrComment,
  Review,
  SuggestionBlock,
} from "../types.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type FetchThread = Omit<ReviewThread, "isResolved" | "isOutdated"> & {
  /** Present when the comment body contains a parseable ```suggestion block. */
  suggestion?: SuggestionBlock;
};

export interface FetchResult {
  prNumber: number;
  actionableThreads: FetchThread[];
  actionableComments: PrComment[];
  changesRequestedReviews: Review[];
  reviewSummaries: Review[];
  /** Mirrors `actions.commitSuggestions` config. When true, the resolve skill prefers the commit-suggestions path for threads with a suggestion block. */
  commitSuggestionsEnabled: boolean;
  /** Numbered triage/fix/resolve steps for the agent to follow, emitted as `## Instructions` in text output. */
  instructions: string[];
}

export interface ResolveCommandOptions extends GlobalOptions {
  /** When true, run in fetch mode regardless of other flags. */
  fetch?: boolean;
}

/**
 * Fetch mode: auto-resolve outdated threads and return all active items for LLM triage.
 */
export async function runResolveFetch(opts: ResolveCommandOptions): Promise<FetchResult> {
  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }

  // Always bypass cache for resolve — we need fresh data before mutating.
  const { data } = await fetchPrBatch(prNumber, repo);

  const unresolvedThreads = data.reviewThreads.filter((t) => !t.isResolved && !t.isMinimized);
  const visibleComments = data.comments.filter((c) => !c.isMinimized);

  // Auto-resolve outdated.
  const outdated = getOutdatedThreads(unresolvedThreads);
  if (outdated.length > 0) {
    const { errors } = await autoResolveOutdated(outdated.map((t) => t.id));
    if (errors.length > 0) {
      throw new Error(`Failed to auto-resolve outdated threads: ${errors.join(", ")}`);
    }
  }

  const activeThreads = unresolvedThreads.filter((t) => !t.isOutdated);

  const cfg = loadConfig();

  const actionableThreads: FetchThread[] = activeThreads.map(
    ({ isResolved: _r, isOutdated: _o, ...rest }) => {
      const thread: FetchThread = rest;
      const suggestion = extractSuggestion(rest);
      if (suggestion) thread.suggestion = suggestion;
      return thread;
    },
  );

  const result: Omit<FetchResult, "instructions"> = {
    prNumber,
    actionableThreads,
    actionableComments: visibleComments,
    changesRequestedReviews: data.changesRequestedReviews,
    reviewSummaries: cfg.resolve.fetchReviewSummaries ? data.reviewSummaries : [],
    commitSuggestionsEnabled: cfg.actions.commitSuggestions,
  };

  return { ...result, instructions: buildFetchInstructions(prNumber, result) };
}

/**
 * Attach a parsed suggestion block to a thread if the comment body contains one
 * and the thread has a resolvable line anchor. Threads without `path`/`line`
 * (rare — usually file-level comments) can't accept a suggestion commit.
 */
function extractSuggestion(
  thread: Omit<ReviewThread, "isResolved" | "isOutdated">,
): SuggestionBlock | null {
  if (!thread.path || thread.line === null) return null;
  const parsed = parseSuggestion(thread.body);
  if (!parsed) return null;
  const startLine = thread.startLine ?? thread.line;
  return {
    startLine,
    endLine: thread.line,
    lines: parsed.lines,
    author: thread.author,
  };
}

/**
 * Build the numbered triage/fix/resolve instruction steps for the agent to follow.
 * Steps are conditionally emitted based on what the fetch returned (mirrors
 * `buildFixInstructions` in `commands/iterate.mts`).
 */
function buildFetchInstructions(
  prNumber: number,
  result: Omit<FetchResult, "instructions">,
): string[] {
  const {
    actionableThreads,
    actionableComments,
    changesRequestedReviews,
    reviewSummaries,
    commitSuggestionsEnabled,
  } = result;

  const total =
    actionableThreads.length +
    actionableComments.length +
    changesRequestedReviews.length +
    reviewSummaries.length;

  if (total === 0) {
    return ["No actionable items — end this invocation."];
  }

  const hasCodeItems =
    actionableThreads.length > 0 ||
    actionableComments.length > 0 ||
    changesRequestedReviews.length > 0 ||
    reviewSummaries.length > 0;
  const hasSuggestions =
    commitSuggestionsEnabled && actionableThreads.some((t) => t.suggestion != null);

  const instructions: string[] = [];

  instructions.push(
    `Classify every item listed above into exactly one of: Fixed / Actionable / Not relevant / Outdated / Acknowledge. Do not silently skip any item. Bot-authored review summaries (authors whose name contains \`[bot]\` or matches \`copilot-pull-request-reviewer\`, \`gemini-code-assist\`) default to Acknowledge with reason "bot summary — no actionable content" unless the body calls out an unaddressed issue.`,
  );

  if (hasSuggestions) {
    instructions.push(
      `For each Actionable thread marked \`[suggestion]\` in \`## Actionable Review Threads\` above: run \`npx pr-shepherd commit-suggestion ${prNumber} --thread-id <id> --message "<one-sentence headline>" --format=json\`, one thread at a time. On \`applied: true\` mark it Fixed — the CLI already resolved the thread, so exclude the ID from \`--resolve-thread-ids\`. On \`applied: false\` read \`reason\` and \`patch\`, then fall through to the manual fix step — do not retry the same command.`,
    );
  }

  if (hasCodeItems) {
    instructions.push(
      `Read and edit each file referenced under \`## Actionable Review Threads\`, \`## Actionable PR Comments\`, \`## Pending CHANGES_REQUESTED reviews\`, and \`## Review summaries\` above. Reclassify each fixed item as Fixed. If an item is too complex to address, leave it as Actionable for the final report.`,
    );
    instructions.push(
      `Commit changed files: \`git add <files>\` (not \`git add -A\`) \`&& git commit -m "<descriptive message>"\`. If the fixes alter the PR's scope or intent, run \`gh pr edit ${prNumber} --title "<new title>" --body "<new body>"\` to reflect them. Then rebase and push: \`git fetch origin && git rebase origin/$BASE_BRANCH && git push --force-with-lease\`. Cancel stale in-progress runs: \`gh run list --branch $BRANCH --status in_progress --json databaseId --jq '.[].databaseId' | xargs -I{} gh run cancel {}\`.`,
    );
  }

  const requireShaHint = hasCodeItems
    ? ` Include \`--require-sha $(git rev-parse HEAD)\` only when the commit-and-push step above ran.`
    : "";
  const dismissNote =
    changesRequestedReviews.length > 0
      ? ` For \`--dismiss-review-ids\`: \`--message\` is required with one specific sentence describing the fix or the reason for not acting (no boilerplate like "address review comments"); omit \`--message\` when not dismissing. Review-summary IDs (\`PRR_…\` from \`## Review summaries\`) go into \`--minimize-comment-ids\`, never \`--dismiss-review-ids\`.`
      : reviewSummaries.length > 0
        ? ` Review-summary IDs (\`PRR_…\` from \`## Review summaries\`) go into \`--minimize-comment-ids\`.`
        : "";

  instructions.push(
    `Run \`npx pr-shepherd resolve ${prNumber} [--resolve-thread-ids <ids>] [--minimize-comment-ids <ids>] [--dismiss-review-ids <ids> --message "<reason>"]\` with only the non-empty flag subsets. Skip the command entirely if all three ID lists are empty.${requireShaHint}${dismissNote}`,
  );

  instructions.push(
    `Report: echo the CLI's mutation output, then one line per Acknowledged item: \`Acknowledged <id> (@<author>): <reason>\`. If any fetched item was neither resolved nor acknowledged, stop and escalate: "<N> item(s) fetched but not acted on or acknowledged — need human direction before closing".`,
  );

  return instructions;
}

/**
 * Mutation mode: resolve/minimize/dismiss by ID.
 */
export async function runResolveMutate(
  opts: ResolveCommandOptions & ResolveOptions,
): Promise<import("../comments/resolve.mts").ResolveResult> {
  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }

  return applyResolveOptions(prNumber, repo, {
    resolveThreadIds: opts.resolveThreadIds,
    minimizeCommentIds: opts.minimizeCommentIds,
    dismissReviewIds: opts.dismissReviewIds,
    dismissMessage: opts.dismissMessage,
    requireSha: opts.requireSha,
  });
}
