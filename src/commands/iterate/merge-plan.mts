import { loadConfig } from "../../config/load.mts";
import { findMergeStrategies } from "../../config/merge-command-args.mts";
import {
  chooseMergeMethod,
  configuredMergeMethod,
  type MergeMethod,
} from "../../config/merge-method.mts";
import { formatPrUrl } from "../../pr-reference.mts";
import type { MergeCommandPlan } from "../../types.mts";
import { buildPrShepherdCommand } from "../../cli/runner.mts";
import { getGithubTransport } from "../../github/transport.mts";
const ENQUEUE_MUTATION =
  "mutation EnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) { enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) { mergeQueueEntry { id } } }";

export interface MergePlanInput {
  transport?: "rest";
  pr: number;
  repo: string;
  nodeId: string;
  headSha: string;
  queue: boolean;
  queueKnown?: boolean;
  /** Omitted when the batch did not select repository merge settings. */
  allowedMergeMethods?: readonly MergeMethod[];
}

export interface MergeMethodUnavailable {
  unavailable: string;
}

export function buildMergeCommandPlan(
  input: MergePlanInput,
): MergeCommandPlan | MergeMethodUnavailable {
  if (input.transport === "rest" || getGithubTransport() === "rest") {
    const configured = configuredMergeMethod(loadConfig().merge ?? {});
    if (!input.queue && input.queueKnown !== true && configured)
      return {
        unavailable:
          "REST cannot verify merge-queue policy and cannot apply a configured direct merge method to an automatic merge request. Refresh branch policy before merging.",
      };
    const decision = chooseMergeMethod({
      allowed: input.allowedMergeMethods,
      configured: configuredMergeMethod(loadConfig().merge ?? {}),
      fallback: "merge",
    });
    if ("unavailable" in decision) return decision;
    return {
      mode: "rest",
      command: buildPrShepherdCommand([
        "apply",
        "merge",
        formatPrUrl(input.repo, input.pr),
        "--require-sha",
        input.headSha,
        "--merge-action",
        input.queue ? "merge_queue" : input.queueKnown ? "direct_merge" : "default",
        ...(!input.queue && input.queueKnown ? ["--method", decision.method] : []),
        "--transport",
        "rest",
      ]),
    };
  }
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
