import { loadConfig } from "../../config/load.mts";
import { findMergeStrategies } from "../../config/merge-command-args.mts";
import {
  chooseMergeMethod,
  configuredMergeMethod,
  type MergeMethod,
} from "../../config/merge-method.mts";
import { formatPrUrl } from "../../pr-reference.mts";
import type { IterateResult, IterateResultBase, MergeCommandPlan } from "../../types.mts";
import { renderShellCommand } from "../../cli/runner.mts";
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
