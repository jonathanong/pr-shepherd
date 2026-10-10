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
  buildRepeatedWorkflowBranchRecoveryInstructions,
  buildResolveCommandInstruction,
  buildFixCompletionInstruction,
} from "./check-instructions.mts";
import { SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE } from "../shepherd-journal.mts";
import { isFailingAgentCheck } from "../../checks/conclusions.mts";
import { buildCommitSuggestionInstruction } from "../commit-suggestion-instruction.mts";
import { partitionFixThreads, reviewSectionRefs } from "./fix-instruction-threads.mts";
import { buildBranchPushInstruction, buildConflictInstruction } from "./native-stack-rebase.mts";
import { queueEjectionSteps, type QueueEjectionRecovery } from "./queue-recovery-instructions.mts";
import { buildPushJournalSteps } from "./fix-loop-instruction.mts";
import type { InstructionStyle } from "../../config/load.mts";

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
  prReference: string | number,
  _cancelledCount: number,
  firstLookThreads: FirstLookThread[] = [],
  firstLookComments: FirstLookComment[] = [],
  firstLookSummaries: Review[] = [],
  editedSummaries: Review[] = [],
  _inProgressRunIds: string[] = [],
  resolutionOnlyThreads: ReviewThread[] = [],
  resolveOnlyCommand?: ResolveCommand,
  behindBaseHint = "", // iterate.behindBaseHint — see buildBehindBaseHintInstruction
  isBehind = false,
  viewerCanUpdate = false,
  hasExhaustedWorkflowRerun = false,
  stackRebase?: string, // native stack layers rebase with gh-stack, not branch by branch
  queueEjection?: QueueEjectionRecovery, // current merge-queue removal with failing queue checks
  instructionStyle: InstructionStyle = "inline", // see iterate.instructions
): string[] {
  const instructions: string[] = [];
  const { locatedThreads, unlocatedMutatedThreads, unlocatedThreads } = partitionFixThreads(
    threads,
    resolveCommand,
    resolveOnlyCommand,
  );

  const failingChecks = checks.filter((c) => isFailingAgentCheck(c));
  const repeatedWorkflowBranchRecoveryInstructions =
    buildRepeatedWorkflowBranchRecoveryInstructions(
      baseBranch,
      hasExhaustedWorkflowRerun,
      { isBehind, hasConflicts },
      stackRebase,
    );
  const hasRepeatedWorkflowBranchRecovery = repeatedWorkflowBranchRecoveryInstructions.length > 0;
  const hasAnnotations = checks.some((c) => (c.annotations?.length ?? 0) > 0);
  const hasNonConflictHints =
    threads.length > 0 ||
    failingChecks.length > 0 ||
    hasAnnotations ||
    changesRequestedReviews.length > 0 ||
    actionableComments.length > 0;

  // Start with interpretation. The agent decides what raw feedback warrants a code change.
  if (hasNonConflictHints) {
    const actionableSections = reviewSectionRefs({
      hasReviewThreads: locatedThreads.length > 0 || unlocatedMutatedThreads.length > 0,
      hasUnlocatedSkipThreads: unlocatedThreads.length > 0,
      hasActionableComments: actionableComments.length > 0,
      hasFailingChecks: failingChecks.length > 0,
      hasAnnotations,
      hasChangesRequested: changesRequestedReviews.length > 0,
    });
    const sectionRef =
      actionableSections.length > 0 ? `under ${actionableSections.join(", ")}` : "above";
    instructions.push(`Review each item ${sectionRef} and decide whether it needs a code change.`);
  }
  // A conflicting native stack layer follows the printed gh-stack route, so it omits the hint.
  const branchUpdateHint = buildBehindBaseHintInstruction(baseBranch, behindBaseHint, {
    isBehind,
    hasConflicts: hasConflicts && !stackRebase,
  });
  // The conflict hint belongs with the conflict step; otherwise it precedes the push step.
  const hintWithConflictStep = hasConflicts && !hasRepeatedWorkflowBranchRecovery;
  const branchRecovery = hasConflicts || hasRepeatedWorkflowBranchRecovery;
  if (hintWithConflictStep)
    instructions.push(buildConflictInstruction(stackRebase), ...branchUpdateHint);

  const firstLookTotal = firstLookThreads.length + firstLookComments.length;
  if (firstLookTotal > 0)
    instructions.push("Review every item under `## First-look items` before acting.");
  if (firstLookSummaries.length > 0 && viewerCanUpdate)
    instructions.push(SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE);
  const editedTotal =
    editedSummaries.length +
    actionableComments.filter((c) => c.edited).length +
    firstLookThreads.filter((t) => t.edited).length +
    firstLookComments.filter((c) => c.edited).length;
  if (editedTotal > 0)
    instructions.push(
      "Read every item marked `[edited since first look]`, including edited summaries and edited first-look bullets, before deciding whether to resolve a matching thread.",
    );
  if (unlocatedThreads.length > 0)
    instructions.push(
      "Acknowledge each item under `## Unlocated review threads (logged once — no mutation)`. Shepherd cannot route a code fix or review mutation without a path and line; the unchanged item will be skipped on later ticks.",
    );

  const hasSuggestions = locatedThreads.some((t) => t.suggestion);
  if (hasSuggestions)
    instructions.push(buildCommitSuggestionInstruction(prReference, "## Review threads"));

  if (locatedThreads.length > 0 || actionableComments.length > 0) {
    // Actionable comments carry no file/line location (unlike threads), so "referenced above"
    // is only accurate when threads are present.
    const filesRef =
      locatedThreads.length > 0 ? "each file referenced above" : "the relevant files";
    instructions.push(`Apply every warranted review fix in ${filesRef}.`);
  }

  if (resolutionOnlyThreads.length > 0)
    instructions.push(
      "Review the threads under `## Review threads to resolve` before running the generated mutations.",
    );

  instructions.push(
    ...buildFailingCheckInstructions(failingChecks),
    ...repeatedWorkflowBranchRecoveryInstructions,
    ...queueEjectionSteps(queueEjection, stackRebase, branchRecovery),
  );

  if (hasAnnotations)
    instructions.push(
      "Inspect every referenced range under `## Check annotations` and apply any warranted change.",
    );

  if (changesRequestedReviews.length > 0) {
    const staleClause = buildCrStaleClause(changesRequestedReviews);
    instructions.push(
      `Read every body under \`## Changes-requested reviews\` and apply any warranted change.${staleClause}`,
    );
  }

  if (!hintWithConflictStep) instructions.push(...branchUpdateHint);

  const hasReviewMutations =
    resolveCommand.hasMutations || resolveOnlyCommand?.hasMutations === true;
  const mutationSuffix = hasReviewMutations ? " before review mutations" : "";
  const genericPush = !(branchRecovery || queueEjection) && hasNonConflictHints;
  const wantsJournal =
    viewerCanUpdate &&
    (hasReviewMutations ||
      hasNonConflictHints ||
      firstLookTotal > 0 ||
      firstLookSummaries.length > 0 ||
      editedTotal > 0);

  if (branchRecovery || queueEjection) {
    instructions.push(
      buildBranchPushInstruction(stackRebase, hasConflicts, mutationSuffix, !branchRecovery),
    );
  }
  instructions.push(
    ...buildPushJournalSteps(instructionStyle, prReference, genericPush, wantsJournal),
  );

  if (resolveOnlyCommand?.hasMutations)
    instructions.push("Run the `resolve-only:` command shown above.");

  instructions.push(
    ...buildResolveCommandInstruction(resolveCommand),
    buildFixCompletionInstruction(),
  );
  return instructions;
}
