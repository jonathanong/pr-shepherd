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
import type { RestMergeStackGuard } from "../../github/rest-merge.mts";
const ENQUEUE_MUTATION =
  "mutation EnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) { enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) { mergeQueueEntry { id } } }";
const DEQUEUE_MUTATION =
  "mutation DequeuePullRequest($id: ID!) { dequeuePullRequest(input: { id: $id }) { mergeQueueEntry { id } } }";

/** gh CLI cannot remove a queue entry, so dequeueing goes through the GraphQL mutation. */
export function buildDequeueCommand(nodeId: string): string[] {
  return ["gh", "api", "graphql", "-f", `query=${DEQUEUE_MUTATION}`, "-f", `id=${nodeId}`];
}

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
  /** Branch policy requires linear history, so merge commits are excluded. */
  linearHistory?: boolean;
  /** Attach a REST equivalent of the GraphQL merge commands, for when GraphQL quota runs out. */
  restFallback?: boolean;
  expectedStack?: RestMergeStackGuard;
}

export interface MergeMethodUnavailable {
  unavailable: string;
  /** REST could not read queue policy: a retry may read it, so the caller waits instead of escalating. */
  refresh?: true;
}

export function buildMergeCommandPlan(
  input: MergePlanInput,
): MergeCommandPlan | MergeMethodUnavailable {
  if (input.transport === "rest" || getGithubTransport() === "rest") {
    const configured = configuredMergeMethod(loadConfig().merge);
    if (!input.queue && input.queueKnown !== true && configured)
      return {
        unavailable:
          "REST could not read merge-queue policy, so it cannot apply the configured direct merge method to an automatic merge request. Shepherd rereads branch policy on the next poll and stops with `stall-timeout` if it stays unreadable.",
        refresh: true,
      };
    let method: MergeMethod | undefined;
    if (!input.queue && input.queueKnown === true) {
      const decision = chooseMergeMethod({
        allowed: input.allowedMergeMethods,
        configured,
        fallback: "merge",
        linearHistory: input.linearHistory,
      });
      if ("unavailable" in decision) return decision;
      method = decision.method;
    }
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
        ...(method ? ["--method", method] : []),
        ...(input.expectedStack ? ["--expected-stack", JSON.stringify(input.expectedStack)] : []),
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
      ...(input.restFallback && {
        restFallbackCommand: {
          argv: buildPrShepherdCommand([
            "apply",
            "merge",
            formatPrUrl(input.repo, input.pr),
            "--require-sha",
            input.headSha,
            "--merge-action",
            "merge_queue",
            "--transport",
            "rest",
          ]).argv,
        },
      }),
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
  const configuredArgs = mergeConfig["command-args"];
  const decision = chooseMergeMethod({
    allowed: input.allowedMergeMethods,
    configured: configuredMergeMethod(mergeConfig),
    fallback: "merge",
    linearHistory: input.linearHistory,
  });
  if ("unavailable" in decision) return decision;
  const hasStrategy = findMergeStrategies(configuredArgs).length > 0;
  const commandArgs = hasStrategy ? configuredArgs : [...configuredArgs, `--${decision.method}`];
  return {
    mode: "auto",
    command: { argv: [...base, "--auto", ...commandArgs] },
    fallbackCommand: { argv: [...base, ...commandArgs] },
    // `gh pr merge` is GraphQL; this REST call has its own quota and merges immediately.
    ...(input.restFallback && {
      restFallbackCommand: {
        argv: [
          "gh",
          "api",
          "-X",
          "PUT",
          `repos/${input.repo}/pulls/${input.pr}/merge`,
          "-f",
          `sha=${input.headSha}`,
          "-f",
          `merge_method=${decision.method}`,
        ],
      },
    }),
  };
}
