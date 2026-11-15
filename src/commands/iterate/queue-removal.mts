import type { IterateResult, IterateResultBase, ShepherdReport } from "../../types.mts";
import { buildPrShepherdCommand } from "../../cli/runner.mts";
import { formatPrUrl } from "../../pr-reference.mts";
import {
  queueRemovalSignature,
  readQueueRemovalFollowUp,
  writeQueueRemovalFollowUp,
} from "../../state/queue-removal-follow-up.mts";
import { playbookPointer } from "../playbook-pointer.mts";
import { buildFixCompletionInstruction } from "./check-instructions.mts";
import { buildEscalateHumanMessage, buildEscalateSuggestion } from "./escalate.mts";
import { stackRebase } from "./unreported-required.mts";

type StateKey = { owner: string; repo: string; pr: number };

function buildQueueRemovalInstructions(report: ShepherdReport): string[] {
  const route = stackRebase(report);
  const update = route
    ? `update the stack from the latest base (${route}) and push it`
    : "update the PR head from the latest base and push";
  return [
    `GitHub removed PR #${report.pr} from the merge queue, and Shepherd has no failed queue-commit check to triage. The \`**queue removal**\` line above carries the raw reason and actor.`,
    `Decide from them. If the reason names a merge conflict, an invalid merge commit, or a stack that changed, ${update}. If a person dequeued the PR (the actor is a user, not a bot or \`github-actions\`), make no change and report that. If the reason is missing or unclear, find out why before acting. Never enqueue the PR yourself. ${playbookPointer("Merge queue ejection")}`,
    "If the head is unchanged on the next poll, Shepherd escalates with `merge-queue-removed`; report what you found then.",
    buildFixCompletionInstruction(),
  ];
}

function triageResult(
  base: IterateResultBase,
  report: ShepherdReport,
  instructions: string[],
): IterateResult {
  return {
    ...base,
    action: "triage",
    triage: {
      threads: [],
      resolutionOnlyThreads: [],
      actionableComments: [],
      reviewSummaryIds: [],
      firstLookSummaries: [],
      editedSummaries: [],
      surfacedApprovals: [],
      checks: [],
      changesRequestedReviews: [],
      resolveCommand: {
        argv: buildPrShepherdCommand(["apply", "review", formatPrUrl(report.repo, report.pr)]).argv,
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      instructions,
      firstLookThreads: [],
      firstLookComments: [],
    },
  };
}

function escalateResult(base: IterateResultBase, report: ShepherdReport): IterateResult {
  const removal = report.mergeQueue!.latestRemoval!;
  const escalateBase = {
    triggers: ["merge-queue-removed" as const],
    unresolvedThreads: [],
    ambiguousComments: [],
    changesRequestedReviews: [],
    mergeQueueRemoval: removal,
    suggestion: buildEscalateSuggestion(
      ["merge-queue-removed"],
      removal.reason ?? "GitHub did not provide a reason",
    ),
  };
  return {
    ...base,
    action: "escalate",
    escalate: {
      ...escalateBase,
      humanMessage: buildEscalateHumanMessage(escalateBase, formatPrUrl(report.repo, report.pr), {
        merge: true,
      }),
    },
  };
}

/**
 * A current merge-queue removal with no failed queue-commit check to triage. The first presented
 * tick for this head and removal is one bounded `triage`; the same removal unchanged on the next
 * presented tick escalates. A new head ends the removal's currency, so it never reaches here.
 */
export async function planQueueRemoval(input: {
  base: IterateResultBase;
  report: ShepherdReport;
  stallKey: StateKey;
  /** Internal preview ticks must not consume the one investigation tick. */
  persistState: boolean;
}): Promise<IterateResult> {
  const { base, report, stallKey, persistState } = input;
  const removal = report.mergeQueue!.latestRemoval!;
  const signature = queueRemovalSignature({
    headSha: report.headSha ?? "unknown",
    createdAtUnix: removal.createdAtUnix,
    ...(removal.beforeCommitOid && { beforeCommitOid: removal.beforeCommitOid }),
  });
  if (await readQueueRemovalFollowUp(stallKey, signature)) return escalateResult(base, report);
  if (persistState) await writeQueueRemovalFollowUp(stallKey, signature);
  return triageResult(base, report, buildQueueRemovalInstructions(report));
}
