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
import { buildPrShepherdCommand, renderShellCommand } from "../../cli/runner.mts";
import {
  buildFailingCheckInstructions,
  buildCrStaleClause,
  buildBehindBaseHintInstruction,
  buildRepeatedWorkflowBranchRecoveryInstructions,
  buildResolveCommandInstruction,
  buildDismissReviewsCommandInstruction,
  buildFixCompletionInstruction,
  QUEUED_CONFLICT_CONTINUATION,
} from "./check-instructions.mts";
import { isFailingAgentCheck } from "../../checks/conclusions.mts";
import { buildCommitSuggestionInstruction } from "../commit-suggestion-instruction.mts";
import { partitionFixThreads } from "./fix-instruction-threads.mts";
import {
  buildBranchPushInstruction,
  buildConflictInstruction,
  buildQueuedConflictChoice,
} from "./native-stack-rebase.mts";
import { queueEjectionSteps, type QueueEjectionRecovery } from "./queue-recovery-instructions.mts";
import { buildPushSteps } from "./triage-loop-instruction.mts";
import type { InstructionStyle } from "../../config/load.mts";

/** Render a resolve command, appending `--require-sha HEAD` when `requiresHeadSha` is set. */
export function renderResolveCommand(rc: ResolveCommand): string {
  const command = renderShellCommand(rc.argv);
  return rc.requiresHeadSha ? `${command} ${REQUIRE_HEAD_SHA}` : command;
}

const REQUIRE_HEAD_SHA = "--require-sha HEAD";

export function buildFixInstructions(
  threads: AgentThread[],
  actionableComments: AgentComment[],
  checks: AgentCheck[],
  changesRequestedReviews: Review[],
  baseBranch: string,
  resolveCommand: ResolveCommand,
  hasConflicts: boolean,
  prReference: string | number,
  firstLookThreads: FirstLookThread[] = [],
  firstLookComments: FirstLookComment[] = [],
  firstLookSummaries: Review[] = [],
  editedSummaries: Review[] = [],
  resolutionOnlyThreads: ReviewThread[] = [],
  resolveOnlyCommand?: ResolveCommand,
  behindBaseHint = "",
  isBehind = false,
  _viewerCanUpdate = false,
  hasExhaustedWorkflowRerun = false,
  stackRebase?: string,
  queueEjection?: QueueEjectionRecovery,
  instructionStyle: InstructionStyle = "inline",
  dequeueCommand?: string,
  cancelRunsStep?: string,
  dismissReviewsCommand?: ResolveCommand,
): string[] {
  const instructions: string[] = [];
  const { locatedThreads, unlocatedThreads } = partitionFixThreads(
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
  // A queued conflict offers a wait path that publishes nothing, so mutating steps become path (a).
  const pathA = (step: string) => (dequeueCommand ? `If you chose (a): ${step}` : step);
  if (cancelRunsStep) instructions.push(cancelRunsStep);
  if (hasNonConflictHints) instructions.push(pathA("Fix each warranted item."));
  const branchUpdateHint = buildBehindBaseHintInstruction(baseBranch, behindBaseHint, {
    isBehind,
    hasConflicts: hasConflicts && !stackRebase,
  }).map(pathA);
  const hintWithConflictStep = hasConflicts && !hasRepeatedWorkflowBranchRecovery;
  const branchRecovery = hasConflicts || hasRepeatedWorkflowBranchRecovery;
  if (hintWithConflictStep)
    instructions.push(buildConflictInstruction(stackRebase, dequeueCommand), ...branchUpdateHint);
  else if (dequeueCommand && hasRepeatedWorkflowBranchRecovery)
    instructions.push(
      `The branch has merge conflicts (see \`**branch**\` above). ${buildQueuedConflictChoice(dequeueCommand, "Follow the steps marked `If you chose (a):` below.", stackRebase !== undefined)}`,
    );

  const firstLookTotal = firstLookThreads.length + firstLookComments.length;
  if (firstLookTotal > 0)
    instructions.push("Review every item under `## First-look items` before acting.");
  if (firstLookSummaries.length > 0)
    instructions.push("Read each body under `## Review summaries (first look)` before acting.");
  const editedTotal = editedSummaries.length + firstLookThreads.filter((t) => t.edited).length;
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
    instructions.push(pathA(buildCommitSuggestionInstruction(prReference, "## Review threads")));

  if (resolutionOnlyThreads.length > 0)
    instructions.push(
      "Review the threads under `## Review threads to resolve` before running the generated mutations.",
    );

  const hasElsewhere = failingChecks.some(
    (c) => c.elsewhere !== undefined || c.elsewhereUnread !== undefined,
  );
  instructions.push(
    ...buildFailingCheckInstructions(failingChecks),
    ...repeatedWorkflowBranchRecoveryInstructions.map(pathA),
    ...queueEjectionSteps(queueEjection, stackRebase, branchRecovery, hasElsewhere),
  );

  if (hasAnnotations)
    instructions.push(
      pathA(
        "Inspect every referenced range under `## Check annotations` and apply any warranted change.",
      ),
    );

  // The first step already covers applying changes-requested bodies; only stale CRs add a step.
  const staleClause = buildCrStaleClause(changesRequestedReviews);
  if (staleClause) instructions.push(staleClause);

  if (!hintWithConflictStep) instructions.push(...branchUpdateHint);

  const hasReviewFeedback =
    threads.length > 0 ||
    resolutionOnlyThreads.length > 0 ||
    firstLookThreads.length > 0 ||
    changesRequestedReviews.length > 0 ||
    actionableComments.length > 0 ||
    firstLookSummaries.length > 0 ||
    editedSummaries.length > 0;
  if (hasReviewFeedback) {
    const journalCommand = buildPrShepherdCommand(["apply", "journal", String(prReference)]).text;
    instructions.push(
      `Optional: If you reject a code review suggestion, journal why: \`${journalCommand} '- <reason>'\`.`,
    );
  }

  const hasReviewMutations =
    resolveCommand.hasMutations ||
    resolveOnlyCommand?.hasMutations === true ||
    dismissReviewsCommand?.hasMutations === true;
  const mutationSuffix = hasReviewMutations ? " before review mutations" : "";
  const genericPush = !(branchRecovery || queueEjection) && hasNonConflictHints;

  if (branchRecovery || queueEjection) {
    instructions.push(
      pathA(buildBranchPushInstruction(stackRebase, hasConflicts, mutationSuffix, !branchRecovery)),
    );
  }
  instructions.push(...buildPushSteps(instructionStyle, genericPush));

  if (resolveOnlyCommand?.hasMutations)
    instructions.push(pathA(`Run: \`${renderResolveCommand(resolveOnlyCommand)}\``));
  instructions.push(
    ...buildResolveCommandInstruction(resolveCommand, renderResolveCommand(resolveCommand)).map(
      pathA,
    ),
    ...(dismissReviewsCommand?.hasMutations
      ? buildDismissReviewsCommandInstruction(
          dismissReviewsCommand,
          renderResolveCommand(dismissReviewsCommand),
        ).map(pathA)
      : []),
    dequeueCommand ? QUEUED_CONFLICT_CONTINUATION : buildFixCompletionInstruction(),
  );
  return instructions;
}
