import type { FetchResult } from "./resolve.mts";
import { buildPrShepherdCommand } from "../cli/runner.mts";
import {
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS,
  buildShepherdJournalInstruction,
} from "./shepherd-journal.mts";
import { buildCommitSuggestionInstruction } from "./commit-suggestion-instruction.mts";

/**
 * Build the numbered triage/fix/resolve instruction steps for the agent to follow.
 * Steps are conditionally emitted based on what the fetch returned (mirrors
 * `buildFixInstructions` in `commands/iterate/render.mts`).
 */
export function buildFetchInstructions(
  prNumber: number,
  result: Omit<FetchResult, "instructions">,
): string[] {
  const {
    actionableThreads,
    resolutionOnlyThreads,
    firstLookThreads,
    actionableComments,
    firstLookComments,
    changesRequestedReviews,
    reviewSummaries,
    commitSuggestionsEnabled,
  } = result;

  const firstLookTotal = firstLookThreads.length + firstLookComments.length;

  const total =
    actionableThreads.length +
    resolutionOnlyThreads.length +
    actionableComments.length +
    changesRequestedReviews.length +
    reviewSummaries.length +
    firstLookTotal;

  if (total === 0) {
    return ["No actionable items and no first-look items — end this invocation."];
  }

  const hasCodeItems =
    actionableThreads.length > 0 ||
    actionableComments.length > 0 ||
    changesRequestedReviews.length > 0;
  const hasSuggestions =
    commitSuggestionsEnabled && actionableThreads.some((t) => t.suggestion != null);

  const instructions: string[] = [];

  instructions.push(
    `Classify every item listed above into exactly one of: Fixed / Actionable / Not relevant / Outdated / Acknowledge. Do not silently skip any item. Bot-authored review summaries (authors whose name contains \`[bot]\` or matches \`copilot-pull-request-reviewer\`, \`gemini-code-assist\`) default to Acknowledge with reason "bot summary — no actionable content" unless the body calls out an unaddressed issue.`,
  );

  if (firstLookTotal > 0) {
    instructions.push(
      `Items in \`## First-look items\` are shown so you can acknowledge their current status before acting. If a first-look thread also appears under \`## Review threads to resolve\`, include its ID in \`--resolve-thread-ids\`; otherwise do not pass first-look-only IDs to mutation flags.`,
    );
  }
  const editedTotal =
    actionableComments.filter((c) => c.edited).length +
    firstLookThreads.filter((t) => t.edited).length +
    firstLookComments.filter((c) => c.edited).length;
  if (editedTotal > 0) {
    instructions.push(
      `Actionable comments marked \`[edited since first look]\` and first-look bullets tagged \`, edited\` were updated by their author after you previously acknowledged them. Read the updated body before deciding whether any matching \`## Review threads to resolve\` item should be resolved.`,
    );
  }

  if (hasSuggestions) {
    instructions.push(
      buildCommitSuggestionInstruction(prNumber, "## Actionable Review Threads", true),
    );
  }

  if (hasCodeItems) {
    instructions.push(
      `Read and edit each file referenced under \`## Actionable Review Threads\`, \`## Actionable PR Comments\`, and \`## Pending CHANGES_REQUESTED reviews\` above. Reclassify each fixed item as Fixed. If an item is too complex to address, leave it as Actionable for the final report.`,
    );
    instructions.push(
      `If you applied code edits: commit them with a descriptive message, cancel any stale in-progress runs, then rebase and push per your repository's conventions.`,
    );
  }

  if (resolutionOnlyThreads.length > 0) {
    instructions.push(
      `Resolve each thread under \`## Review threads to resolve\` with \`--resolve-thread-ids\`. These threads are already outdated or minimized, so no code edit is required for them unless their body reveals separate work you choose to do.`,
    );
  }

  const requireShaHint = hasCodeItems
    ? ` Include \`--require-sha $(git rev-parse HEAD)\` only when you pushed new commits.`
    : "";
  const dismissNote =
    changesRequestedReviews.length > 0
      ? ` For \`--dismiss-review-ids\`: \`--message\` is required with one specific sentence describing the fix or the reason for not acting (no boilerplate like "address review comments"); omit \`--message\` when not dismissing. Review-summary IDs (\`PRR_…\` from \`## Review summaries\`) go into \`--minimize-comment-ids\`, never \`--dismiss-review-ids\`.`
      : reviewSummaries.length > 0
        ? ` Review-summary IDs (\`PRR_…\` from \`## Review summaries\`) go into \`--minimize-comment-ids\`.`
        : "";

  const resolveCommand = `${buildPrShepherdCommand(["resolve", String(prNumber)]).text} [--reply-thread-ids <ids> --message "<reason>"] [--resolve-thread-ids <ids>] [--minimize-comment-ids <ids>] [--dismiss-review-ids <ids> --message "<reason>"]`;
  if (actionableThreads.length > 0 || resolutionOnlyThreads.length > 0) {
    instructions.push(
      `Do not reply to your own thread comments. If the latest visible comment in a thread is your own prior Shepherd reply, leave that thread out of \`--reply-thread-ids\`.`,
    );
  }
  instructions.push(
    `Run \`${resolveCommand}\` with only the non-empty flag subsets. Skip the command entirely if all three ID lists are empty.${requireShaHint}${dismissNote}`,
  );

  instructions.push(
    buildShepherdJournalInstruction(
      prNumber,
      SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS,
    ),
  );

  instructions.push(
    `Report: echo the CLI's mutation output, then one line per Acknowledged item: \`Acknowledged <id> (@<author>): <reason>\`. If any fetched item was neither resolved nor acknowledged, stop and escalate: "<N> item(s) fetched but not acted on or acknowledged — need human direction before closing".`,
  );

  return instructions;
}
