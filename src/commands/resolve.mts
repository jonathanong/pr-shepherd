import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { loadConfig } from "../config/load.mts";
import { classifyVisibleComments } from "../comments/visible-comments.mts";
import { extractSuggestion } from "../suggestions/extract.mts";
import { buildFetchInstructions } from "./resolve-instructions.mts";
import { loadSeenMap, markSeen, classifyItem } from "../state/seen-comments.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import { classifyThreadVisibility } from "../comments/thread-visibility.mts";
import type {
  GlobalOptions,
  ReviewThread,
  Review,
  SuggestionBlock,
  FirstLookThread,
  FirstLookComment,
  ActionableComment,
} from "../types.mts";

export { runResolveMutate } from "./resolve-mutate.mts";

export type FetchThread = Omit<ReviewThread, "isResolved" | "isOutdated"> & {
  /** Present when the comment body contains a parseable ```suggestion block. */
  suggestion?: SuggestionBlock;
};

export interface FetchResult {
  prNumber: number;
  actionableThreads: FetchThread[];
  /** Unresolved threads that should be resolved on GitHub without requiring code edits. */
  resolutionOnlyThreads: ReviewThread[];
  /** First-look threads — outdated/resolved/minimized, surfaced for agent acknowledgment on first encounter only. */
  firstLookThreads: FirstLookThread[];
  actionableComments: ActionableComment[];
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
  fetch?: boolean;
}

export async function runResolveFetch(opts: ResolveCommandOptions): Promise<FetchResult> {
  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }

  const { data } = await fetchPrBatch(prNumber, repo);

  const stateKey = { owner: repo.owner, repo: repo.name, pr: prNumber };

  const minimizedCommentCandidates = data.comments.filter((c) => c.isMinimized);

  const seenMap = await loadSeenMap(stateKey);
  const threadVisibility = classifyThreadVisibility(data.reviewThreads, seenMap);
  const unseenMinimizedComments: typeof minimizedCommentCandidates = [];
  const editedMinimizedComments: typeof minimizedCommentCandidates = [];
  for (const c of minimizedCommentCandidates) {
    const cls = classifyItem(c.id, c.body, seenMap);
    if (cls === "new") unseenMinimizedComments.push(c);
    else if (cls === "edited") editedMinimizedComments.push(c);
  }

  const cfg = loadConfig();
  const visibleCommentClassification = classifyVisibleComments(
    data.comments,
    seenMap,
    cfg.iterate?.minimizeComments,
  );

  const actionableThreads: FetchThread[] = threadVisibility.activeThreads.map(
    ({ isResolved: _r, isOutdated: _o, ...rest }) => {
      const thread: FetchThread = rest;
      const suggestion = extractSuggestion(rest);
      if (suggestion) thread.suggestion = suggestion;
      return thread;
    },
  );

  const firstLookComments: FirstLookComment[] = [
    ...unseenMinimizedComments.map((c) => ({ ...c, firstLookStatus: "minimized" as const })),
    ...editedMinimizedComments.map((c) => ({
      ...c,
      firstLookStatus: "minimized" as const,
      edited: true as const,
    })),
  ];

  // Mark new and edited items as seen (best-effort — markSeen never throws).
  await Promise.allSettled([
    ...threadVisibility.toMarkSeen.map((t) => markSeen(stateKey, t.id, threadTranscriptBody(t))),
    ...firstLookComments.map((c) => markSeen(stateKey, c.id, c.body)),
    ...visibleCommentClassification.toMarkSeen.map((c) => markSeen(stateKey, c.id, c.body)),
  ]);

  const result: Omit<FetchResult, "instructions"> = {
    prNumber,
    actionableThreads,
    resolutionOnlyThreads: threadVisibility.resolutionOnlyThreads,
    firstLookThreads: threadVisibility.firstLookThreads,
    actionableComments: visibleCommentClassification.actionable,
    firstLookComments,
    changesRequestedReviews: data.changesRequestedReviews,
    reviewSummaries: cfg.resolve.fetchReviewSummaries ? data.reviewSummaries : [],
    commitSuggestionsEnabled: cfg.actions.commitSuggestions,
  };

  return { ...result, instructions: buildFetchInstructions(prNumber, result) };
}
