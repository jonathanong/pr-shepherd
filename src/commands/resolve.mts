import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { getOutdatedThreads } from "../comments/outdated.mts";
import { autoResolveOutdated, applyResolveOptions } from "../comments/resolve.mts";
import { loadConfig } from "../config/load.mts";
import { parseSuggestion } from "../suggestions/parse.mts";
import { buildFetchInstructions } from "./resolve-instructions.mts";
import { hasSeen, markSeen } from "../state/seen-comments.mts";
import type {
  GlobalOptions,
  ResolveOptions,
  ReviewThread,
  PrComment,
  Review,
  SuggestionBlock,
  FirstLookThread,
  FirstLookComment,
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
  /** First-look threads — outdated/resolved/minimized, surfaced for agent acknowledgment on first encounter only. */
  firstLookThreads: FirstLookThread[];
  actionableComments: PrComment[];
  /** First-look comments — minimized, surfaced for agent acknowledgment on first encounter only. */
  firstLookComments: FirstLookComment[];
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

  const stateKey = { owner: repo.owner, repo: repo.name, pr: prNumber };

  const unresolvedThreads = data.reviewThreads.filter((t) => !t.isResolved && !t.isMinimized);
  const visibleComments = data.comments.filter((c) => !c.isMinimized);

  // First-look: collect items that would normally be hidden and check seen markers.
  const outdatedCandidates = data.reviewThreads.filter((t) => t.isOutdated && !t.isResolved);
  const resolvedCandidates = data.reviewThreads.filter((t) => t.isResolved && !t.isOutdated);
  const minimizedThreadCandidates = data.reviewThreads.filter(
    (t) => t.isMinimized && !t.isResolved && !t.isOutdated,
  );
  const minimizedCommentCandidates = data.comments.filter((c) => c.isMinimized);

  const [
    outdatedSeen,
    resolvedSeen,
    minimizedThreadSeen,
    minimizedCommentSeen,
  ] = await Promise.all([
    Promise.all(outdatedCandidates.map((t) => hasSeen(stateKey, t.id))),
    Promise.all(resolvedCandidates.map((t) => hasSeen(stateKey, t.id))),
    Promise.all(minimizedThreadCandidates.map((t) => hasSeen(stateKey, t.id))),
    Promise.all(minimizedCommentCandidates.map((c) => hasSeen(stateKey, c.id))),
  ]);

  const unseenOutdated = outdatedCandidates.filter((_, i) => !outdatedSeen[i]);
  const unseenResolved = resolvedCandidates.filter((_, i) => !resolvedSeen[i]);
  const unseenMinimizedThreads = minimizedThreadCandidates.filter((_, i) => !minimizedThreadSeen[i]);
  const unseenMinimizedComments = minimizedCommentCandidates.filter((_, i) => !minimizedCommentSeen[i]);

  // Auto-resolve outdated (same as before — fires regardless of first-look status).
  const outdated = getOutdatedThreads(unresolvedThreads);
  const autoResolvedIds = new Set<string>();
  if (outdated.length > 0) {
    const { resolved: resolvedIds, errors } = await autoResolveOutdated(outdated.map((t) => t.id));
    for (const id of resolvedIds) autoResolvedIds.add(id);
    if (errors.length > 0) {
      process.stderr.write(
        `pr-shepherd: auto-resolve outdated threads failed (continuing): ${errors.join(", ")}\n`,
      );
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

  const firstLookThreads: FirstLookThread[] = [
    ...unseenOutdated.map((t) => ({
      ...t,
      firstLookStatus: "outdated" as const,
      autoResolved: autoResolvedIds.has(t.id),
    })),
    ...unseenResolved.map((t) => ({ ...t, firstLookStatus: "resolved" as const })),
    ...unseenMinimizedThreads.map((t) => ({ ...t, firstLookStatus: "minimized" as const })),
  ];

  const firstLookComments: FirstLookComment[] = unseenMinimizedComments.map((c) => ({
    ...c,
    firstLookStatus: "minimized" as const,
  }));

  // Mark first-look items as seen (best-effort, fire-and-forget).
  void Promise.allSettled([
    ...firstLookThreads.map((t) => markSeen(stateKey, t.id)),
    ...firstLookComments.map((c) => markSeen(stateKey, c.id)),
  ]);

  const result: Omit<FetchResult, "instructions"> = {
    prNumber,
    actionableThreads,
    firstLookThreads,
    actionableComments: visibleComments,
    firstLookComments,
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
