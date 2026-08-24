import type {
  AgentThread,
  AgentComment,
  AgentCheck,
  Review,
  ResolveCommand,
  FirstLookThread,
  FirstLookComment,
  ReviewThread,
} from "../../types.mts";
import { renderShellCommand } from "../../cli/runner.mts";
import {
  buildFailingCheckInstructions,
  buildCrStaleClause,
  buildBehindBaseHintInstruction,
  buildResolveCommandInstruction,
  buildFixCompletionInstruction,
} from "./check-instructions.mts";
import {
  SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
  buildShepherdJournalInstruction,
} from "../shepherd-journal.mts";
import { isFailingAgentCheck } from "../../checks/conclusions.mts";
import { buildCommitSuggestionInstruction } from "../commit-suggestion-instruction.mts";

/** Render a resolve command as a shell snippet. Appends `--require-sha "$HEAD_SHA"` when set. */
export function renderResolveCommand(rc: ResolveCommand): string {
  const parts = [...rc.argv];
  if (rc.requiresHeadSha) parts.push("--require-sha", "$HEAD_SHA");
  return renderShellCommand(parts);
}

export function buildFixInstructions(
  threads: AgentThread[],
  actionableComments: AgentComment[],
  checks: AgentCheck[],
  changesRequestedReviews: Review[],
  baseBranch: string,
  resolveCommand: ResolveCommand,
  hasConflicts: boolean,
  prNumber: number,
  cancelledCount: number,
  firstLookThreads: FirstLookThread[] = [],
  firstLookComments: FirstLookComment[] = [],
  firstLookSummaries: Review[] = [],
  editedSummaries: Review[] = [],
  inProgressRunIds: string[] = [],
  resolutionOnlyThreads: ReviewThread[] = [],
  resolveOnlyCommand?: ResolveCommand,
  behindBaseHint = "", // iterate.behindBaseHint — see buildBehindBaseHintInstruction
  isBehind = false,
): string[] {
  const instructions: string[] = [];

  const failingChecks = checks.filter((c) => isFailingAgentCheck(c));
  const hasAnnotations = checks.some((c) => (c.annotations?.length ?? 0) > 0);
  const hasNonConflictHints =
    threads.length > 0 ||
    failingChecks.length > 0 ||
    hasAnnotations ||
    changesRequestedReviews.length > 0 ||
    actionableComments.length > 0;

  // Start with interpretation. The agent decides what raw feedback warrants a code change.
  if (hasNonConflictHints) {
    const actionableSections: string[] = [];
    if (threads.length > 0) actionableSections.push("`## Review threads`");
    if (actionableComments.length > 0) actionableSections.push("`## Actionable comments`");
    if (failingChecks.length > 0) actionableSections.push("`## Failing checks`");
    if (hasAnnotations) {
      actionableSections.push("`## Check annotations`");
    }
    if (changesRequestedReviews.length > 0)
      actionableSections.push("`## Changes-requested reviews`");
    const sectionRef =
      actionableSections.length > 0 ? `under ${actionableSections.join(", ")}` : "above";
    instructions.push(`Review each item ${sectionRef} and decide whether it needs a code change.`);
  }
  if (hasConflicts) {
    instructions.push(
      "The branch has merge conflicts (see `**branch**` above). Resolve them before committing and pushing.",
    );
  }

  const firstLookTotal = firstLookThreads.length + firstLookComments.length;
  if (firstLookTotal > 0) {
    instructions.push(
      "Review every item under `## First-look items` before acting.",
      "If a first-look thread also appears under `## Review threads to resolve`, its ID is already in `apply review:`. Do not add first-look-only IDs to mutation flags.",
    );
  }
  if (firstLookSummaries.length > 0) instructions.push(SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE);
  const editedTotal =
    editedSummaries.length +
    actionableComments.filter((c) => c.edited).length +
    firstLookThreads.filter((t) => t.edited).length +
    firstLookComments.filter((c) => c.edited).length;
  if (editedTotal > 0) {
    instructions.push(
      "Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.",
    );
  }

  if (inProgressRunIds.length > 0) {
    instructions.push(
      "If you will push, first cancel every ID under `## In-progress runs` with `gh run cancel <id>`.",
      "Ignore cancellation errors for runs that already finished.",
      "If you will not push, leave the in-progress runs alone.",
    );
  }
  if (cancelledCount > 0) {
    instructions.push(
      "Do not cancel the IDs under `## Cancelled runs` again. The CLI already cancelled them.",
    );
  }

  const hasSuggestions = threads.some((t) => t.suggestion);
  if (hasSuggestions)
    instructions.push(...buildCommitSuggestionInstruction(prNumber, "## Review threads", false));

  if (threads.length > 0 || actionableComments.length > 0) {
    // Actionable comments carry no file/line location (unlike threads), so "referenced above"
    // is only accurate when threads are present.
    const filesRef = threads.length > 0 ? "each file referenced above" : "the relevant files";
    instructions.push(`Apply every warranted review fix in ${filesRef}.`);
    if (hasSuggestions) {
      instructions.push(
        "After source drift prevents a generated suggestion patch from applying, replace the heading's exact `path:startLine-endLine` range with the `Replaces lines …` block verbatim. An empty replacement deletes the range. One blank line replaces it with one blank line.",
        "When `build-suggestion-patch` refuses an unsafe anchored range, do not apply the replacement block verbatim. Inspect the surrounding source and reviewer intent, then make the intended edit manually.",
      );
    }
  }

  if (resolutionOnlyThreads.length > 0) {
    instructions.push(
      "Review the threads under `## Review threads to resolve` before running mutations.",
      "Use the generated commands as shown. Human-authored IDs use `--reply-thread-ids`. Bot and non-human IDs use `--resolve-thread-ids`. Shepherd does not resolve human-authored threads.",
    );
  }

  instructions.push(...buildFailingCheckInstructions(failingChecks));

  if (hasAnnotations) {
    instructions.push(
      "Inspect every referenced range under `## Check annotations` and apply any warranted change.",
      "Do not add annotation IDs to resolve or minimize mutations.",
    );
  }

  if (changesRequestedReviews.length > 0) {
    const staleClause = buildCrStaleClause(changesRequestedReviews);
    instructions.push(
      `Read every body under \`## Changes-requested reviews\` and apply any warranted change.${staleClause}`,
    );
    if ((resolveCommand.dismissReviewIds?.length ?? 0) > 0)
      instructions.push(
        "Keep every existing `--dismiss-review-ids` ID in `apply review:`. Each is a bot or non-human review that must be dismissed. Omitting one leaves the PR in `CHANGES_REQUESTED`.",
      );
  }

  instructions.push(...buildBehindBaseHintInstruction(baseBranch, behindBaseHint, isBehind));

  const hasReviewMutations =
    resolveCommand.hasMutations || resolveOnlyCommand?.hasMutations === true;
  const mutationSuffix = hasReviewMutations ? " before review mutations" : "";
  if (hasConflicts) {
    instructions.push(
      `Commit any remaining changes and push the conflict resolution${mutationSuffix}.`,
    );
  } else if (hasNonConflictHints) {
    instructions.push(
      `If you changed code, commit any remaining changes and push${mutationSuffix}. Otherwise, do not commit or push.`,
    );
  }

  if (
    hasReviewMutations ||
    hasNonConflictHints ||
    firstLookTotal > 0 ||
    firstLookSummaries.length > 0 ||
    editedTotal > 0
  ) {
    instructions.push(
      ...buildShepherdJournalInstruction(
        prNumber,
        SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
      ),
    );
  }

  if (resolveOnlyCommand?.hasMutations)
    instructions.push("Run the `resolve-only:` command shown above.");

  instructions.push(...buildResolveCommandInstruction(resolveCommand));

  instructions.push(buildFixCompletionInstruction(failingChecks));
  return instructions;
}
