import { loadConfig } from "../../config/load.mts";
import { findMergeStrategies } from "../../config/merge-command-args.mts";
import {
  chooseMergeMethod,
  configuredMergeMethod,
  type MergeMethod,
} from "../../config/merge-method.mts";
import { formatPrUrl } from "../../pr-reference.mts";
import type {
  AgentCheck,
  IterateResult,
  IterateResultBase,
  MergeCommandPlan,
  ShepherdReport,
} from "../../types.mts";
import { renderShellCommand, buildPrShepherdCommand } from "../../cli/runner.mts";
import { hasQueueRecoveryEvidence } from "./check-evidence.mts";
import { isCiQueueRemovalReason } from "../../state/queue-removal-ack.mts";
import { buildEscalateHumanMessage } from "./escalate.mts";

const ENQUEUE_MUTATION =
  "mutation EnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) { enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) { mergeQueueEntry { id } } }";

interface MergePlanInput {
  pr: number;
  repo: string;
  nodeId: string;
  headSha: string;
  queue: boolean;
  /** Omitted when the batch did not select repository merge settings. */
  allowedMergeMethods?: readonly MergeMethod[];
}

export interface MergeMethodUnavailable {
  unavailable: string;
}

export function buildMergeCommandPlan(
  input: MergePlanInput,
): MergeCommandPlan | MergeMethodUnavailable {
  const base = [
    "gh",
    "pr",
    "merge",
    String(input.pr),
    "--repo",
    input.repo,
    "--match-head-commit",
    input.headSha,
  ];
  if (input.queue) {
    return {
      mode: "queue",
      command: { argv: base },
      queueApiFallbackCommand: {
        argv: [
          "gh",
          "api",
          "graphql",
          "-f",
          `query=${ENQUEUE_MUTATION}`,
          "-f",
          `pullRequestId=${input.nodeId}`,
          "-f",
          `expectedHeadOid=${input.headSha}`,
        ],
      },
    };
  }

  const mergeConfig = loadConfig().merge;
  const configuredArgs = mergeConfig?.commandArgs ?? [];
  const decision = chooseMergeMethod({
    allowed: input.allowedMergeMethods,
    configured: configuredMergeMethod(mergeConfig ?? {}),
    fallback: "merge",
  });
  if ("unavailable" in decision) return decision;
  const hasStrategy = findMergeStrategies(configuredArgs).length > 0;
  const commandArgs = hasStrategy ? configuredArgs : [...configuredArgs, `--${decision.method}`];
  return {
    mode: "auto",
    command: { argv: [...base, "--auto", ...commandArgs] },
    fallbackCommand: { argv: [...base, ...commandArgs] },
  };
}

export function renderMergeCommand(command: { argv: string[] }): string {
  return renderShellCommand(command.argv);
}

/** Offer a guarded queue command; the caller decides whether the failure warrants a PR fix. */
export function buildRemovedQueueRecovery(
  report: ShepherdReport,
  checks: AgentCheck[],
  merge: boolean | undefined,
): MergeCommandPlan | undefined {
  if (report.mergeStatus.mergeRequirements?.stack) return undefined;
  if (!removedQueueRecoveryAvailable(report, checks, merge)) return undefined;
  const plan = buildMergeCommandPlan({
    pr: report.pr,
    repo: report.repo,
    nodeId: report.nodeId,
    headSha: report.headSha!,
    queue: true,
  });
  return "unavailable" in plan ? undefined : plan;
}

/** Bind a caller's disposition to one removed stack queue commit, without submitting a merge. */
export function buildStackQueueRemovalAcknowledgment(
  report: ShepherdReport,
  checks: AgentCheck[],
): { argv: string[] } | undefined {
  if (!report.mergeStatus.mergeRequirements?.stack) return undefined;
  // This records a local disposition, without enqueueing; aggregate child sessions omit --merge.
  if (!removedQueueRecoveryAvailable(report, checks, true)) return undefined;
  const removal = report.mergeQueue!.latestRemoval!;
  return buildPrShepherdCommand([
    "apply",
    "queue-removal",
    formatPrUrl(report.repo, report.pr),
    "--require-sha",
    report.headSha!,
    "--queue-commit",
    removal.beforeCommitOid!,
    "--removed-at",
    String(removal.createdAtUnix),
  ]);
}

function removedQueueRecoveryAvailable(
  report: ShepherdReport,
  checks: AgentCheck[],
  merge: boolean | undefined,
): boolean {
  const queue = report.mergeQueue;
  const removedCommit = queue?.latestRemoval?.beforeCommitOid;
  if (
    !merge ||
    !queue?.enabled ||
    queue.inQueue ||
    queue.headUpdatedAfterRemoval ||
    // GitHub exposes a raw string, not a capability to reverse a human's queue removal.
    // Only known CI-driven reasons authorize offering automated recovery.
    !isCiQueueRemovalReason(queue.latestRemoval?.reason) ||
    !queue.latestRemoval ||
    queue.latestRemoval.createdAtUnix <= 0 ||
    !removedCommit ||
    !report.headSha ||
    !report.nodeId ||
    !checks.some((check) => check.scope === "merge_group" && check.commitOid === removedCommit)
  )
    return false;
  return checks
    .filter((check) => check.scope === "merge_group" && check.commitOid === removedCommit)
    .every(hasQueueRecoveryEvidence);
}

export function unavailableMergeResult(
  base: IterateResultBase,
  report: { pr: number; repo: string },
  unavailable: string,
): IterateResult {
  const escalateBase = {
    triggers: ["merge-method-unavailable" as const],
    unresolvedThreads: [],
    ambiguousComments: [],
    changesRequestedReviews: [],
    suggestion: unavailable,
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
