import type { CommitSuggestionResult, GlobalOptions } from "../types.mts";
import { buildSingularInstructions } from "./suggestion-patch-item.mts";
import { runSuggestionPatches } from "./suggestion-patches.mts";
import { formatPrUrl } from "../pr-reference.mts";

export interface CommitSuggestionOptions extends GlobalOptions {
  threadId: string;
  message: string;
  description?: string;
}

/** @deprecated Use runSuggestionPatches. */
export async function runCommitSuggestion(
  opts: CommitSuggestionOptions,
): Promise<CommitSuggestionResult> {
  const result = await runSuggestionPatches({
    prNumber: opts.prNumber,
    targetRepository: opts.targetRepository,
    format: opts.format,
    verbose: opts.verbose,
    suggestions: [
      {
        threadId: opts.threadId,
        message: opts.message,
        ...(opts.description !== undefined && { description: opts.description }),
      },
    ],
  });
  const patch = result.patches[0]!;
  return {
    ...patch,
    pr: result.pr,
    repo: result.repo,
    postActionInstructions: buildSingularInstructions(patch, formatPrUrl(result.repo, result.pr)),
  };
}
