import { loadConfig } from "../../config/load.mts";
import { findMergeStrategies } from "../../config/merge-command-args.mts";
import type { MergeCommandPlan } from "../../types.mts";
import { renderShellCommand } from "../../cli/runner.mts";

const ENQUEUE_MUTATION =
  "mutation EnqueuePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) { enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) { mergeQueueEntry { id } } }";

interface MergePlanInput {
  pr: number;
  repo: string;
  nodeId: string;
  headSha: string;
  queue: boolean;
}

export function buildMergeCommandPlan(input: MergePlanInput): MergeCommandPlan {
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

  const configuredArgs = loadConfig().merge?.commandArgs ?? [];
  const hasStrategy = findMergeStrategies(configuredArgs).length > 0;
  const commandArgs = hasStrategy ? configuredArgs : [...configuredArgs, "--merge"];
  return {
    mode: "auto",
    command: { argv: [...base, "--auto", ...commandArgs] },
    fallbackCommand: { argv: [...base, ...commandArgs] },
  };
}

export function renderMergeCommand(command: { argv: string[] }): string {
  return renderShellCommand(command.argv);
}
