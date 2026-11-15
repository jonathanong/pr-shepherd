import { getGithubTransport } from "../github/transport.mts";
import type { PollSummaryItem, PollSummaryResult, StackMergeScope } from "../types.mts";
import { buildMergeCommandPlan, renderMergeCommand } from "./iterate/merge.mts";
import {
  appendAutonomousInstructions,
  idleWaitPlan,
  appendHumanHandoffInstructions,
  findHumanHandoffs,
  hasListedOwnership,
  type StackPlan,
} from "./stack-drain.mts";
import {
  isStackLayerReady,
  aboveThroughTarget,
  closedInScope,
  mergeScopeLayers,
  openLayers,
  readyPrefix,
  stackPosition,
  type StackLayer,
} from "./stack-merge-scope.mts";
import { stackMergeFlag } from "./stack-merge-flag.mts";
import {
  addedLayersEscalation,
  escalation,
  list,
  scopeDone,
  unlistedEscalation,
  type ApproveCommands,
} from "./stack-merge-escalations.mts";
import { splitStackWork, stackRerunTarget } from "./stack-work.mts";

export type { ApproveCommands };

const NO_PER_LAYER =
  "One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself.";

/**
 * The merge the requested scope allows, an escalation when the scope cannot be merged safely, or
 * undefined when ordinary shepherding continues. A merge lands its target and every unmerged layer
 * below it, so it is only emitted once every open layer it would land is ready and owned.
 */
export function planStackMerge(
  result: PollSummaryResult,
  scope: StackMergeScope | undefined,
  rerunCommand?: string,
  approve?: ApproveCommands,
): StackPlan | undefined {
  const open = openLayers(result);
  if (!scope || open.length === 0) return undefined;
  const added = addedLayersEscalation(result, open, scope, rerunCommand);
  if (scope.kind === "ready") {
    if (added) return added;
    const prefix = readyPrefix(result, true);
    const top = prefix.at(-1);
    if (top) return mergePlan(result, top, scope, rerunCommand);
    const bottom = open.reduce((low, item) =>
      stackPosition(item) < stackPosition(low) ? item : low,
    );
    if (!bottom.owned && isStackLayerReady(bottom) && open.some((item) => item.owned)) {
      const above = open.filter((item) => item.owned).at(-1)!;
      return unlistedEscalation(above, [bottom], rerunCommand, approve);
    }
    return open.some((item) => item.owned) || closedInScope(result, scope).length > 0
      ? undefined
      : scopeDone(open);
  }
  if (scope.kind === "through") {
    const row = result.prs.find((item) => item.pr === scope.pr);
    if (!row || row.state === "CLOSED") {
      return escalation(
        `\`merge-through-target-closed\`: the \`--merge-through\` target PR #${scope.pr} ${row ? "was closed without merging" : "is no longer a layer of this stack"}, so the request no longer names a layer to merge up to. Nothing was merged. Stop and tell the user. They either name another target, and you rerun ${stackRerunTarget(rerunCommand)} with that PR as \`--merge-through\`, or restore PR #${scope.pr}.`,
      );
    }
  }
  const { target } = mergeScopeLayers(result, scope);
  if (!target) return closedInScope(result, scope).length > 0 ? undefined : scopeDone(open);
  if (added) return added;
  const unowned = open.filter(
    (item) => !item.owned && stackPosition(item) <= stackPosition(target),
  );
  if (unowned.length > 0) return unlistedEscalation(target, unowned, rerunCommand, approve);
  return readyPrefix(result, false).some((item) => item.pr === target.pr)
    ? mergePlan(result, target as StackLayer, scope, rerunCommand)
    : undefined;
}

/** The one merge for `top`, which lands it and every unmerged layer below it. */
function mergePlan(
  result: PollSummaryResult,
  top: PollSummaryItem,
  scope: StackMergeScope,
  rerunCommand?: string,
): StackPlan {
  const stack = top.stack!;
  const outside = aboveThroughTarget(result, scope);
  const open = openLayers(result);
  const lands = open.filter((item) => stackPosition(item) <= stackPosition(top));
  const above = open.filter((item) => stackPosition(item) > stackPosition(top));
  const gaps = result.stackAncestry ?? [];
  const staleChildren = new Set(gaps.map((gap) => gap.childPr));
  const work = splitStackWork(
    above.filter(
      (item) =>
        item.action !== "escalate" &&
        !outside.has(item.pr) &&
        (!isStackLayerReady(item) || staleChildren.has(item.pr)),
    ),
    staleChildren,
  );
  const landing = lands.length === 1 ? `PR #${top.pr} alone` : `PRs ${list(lands)}`;
  const partial = result.selection.kind === "stack" && result.selection.owned !== undefined;
  const ownership = partial
    ? ` (${above.every((item) => item.owned) ? "owned" : above.some((item) => item.owned) ? "owned and unowned" : "not owned"})`
    : "";
  const left =
    above.length > 0
      ? ` ${list(above)} stay${above.length === 1 ? "s" : ""} open above it${ownership}; GitHub retargets ${above.length === 1 ? "it" : "them"} onto \`${stack.baseRefName}\`.`
      : "";
  const first = mergeStep(result, top, landing, left);
  if ("unavailable" in first) {
    if (!first.refresh) return escalation(first.unavailable);
    const waiting = idleWaitPlan(lands);
    return { ...waiting, instructions: [`1. ${first.unavailable}`] };
  }
  const instructions = [first.text];
  appendAutonomousInstructions(instructions, work.sessions, hasListedOwnership(result));
  const handoffs = findHumanHandoffs(result);
  if (handoffs) appendHumanHandoffInstructions(instructions, handoffs, false);
  instructions.push(
    `${instructions.length + 1}. After the merge attempt, rerun ${rerunCommand ? stackRerunTarget(rerunCommand) : "this same `stack` merge command"}; GitHub retargets the next layer onto \`${stack.baseRefName}\`. Shepherd any layer that GitHub rejects or ejects.`,
  );
  return {
    action: "merge",
    stackMergeable: gaps.length === 0 && open.every(isStackLayerReady),
    instructions,
  };
}

function mergeStep(
  result: PollSummaryResult,
  top: PollSummaryItem,
  landing: string,
  left: string,
): { text: string } | { unavailable: string; refresh?: true } {
  const stack = top.stack!;
  if (getGithubTransport() === "rest" || top.transport === "rest") {
    // Upper layers target their parent; the prefix merges into the stack trunk.
    const trunk = result.prs.find((item) => item.baseRefName === stack.baseRefName);
    const plan = buildMergeCommandPlan({
      transport: "rest",
      pr: top.pr,
      repo: result.repo,
      nodeId: "",
      headSha: top.headRefOid,
      queue: trunk?.requiresMergeQueue === true,
      queueKnown: trunk?.requiresMergeQueue !== undefined,
      allowedMergeMethods: result.allowedMergeMethods,
      expectedStack: {
        number: stack.number,
        baseRefName: stack.baseRefName,
        prefix: [...result.prs]
          .sort((left, right) => stackPosition(left) - stackPosition(right))
          .filter((item) => stackPosition(item) <= stackPosition(top))
          .map((item) => ({
            pr: item.pr,
            headRefName: item.headRefName,
            headRefOid: item.headRefOid,
            baseRefName: item.baseRefName,
          })),
      },
    });
    if ("unavailable" in plan)
      return { unavailable: plan.unavailable, ...(plan.refresh && { refresh: true as const }) };
    return {
      text: `1. Run \`${renderMergeCommand(plan.command)}\` to request merging ${landing} of native stack #${stack.number}.${left} ${NO_PER_LAYER} If status is \`pending\`, rerun that command at the configured cadence to resume its UUID. \`enqueued\` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.`,
    };
  }
  const method = stackMergeFlag(result.allowedMergeMethods);
  if ("unavailable" in method) return { unavailable: method.unavailable };
  return {
    text: `1. Run \`GH_REPO=${result.repo} gh stack merge ${top.pr} --yes ${method.flag}\` in \`${result.repo}\` to merge ${landing} of stack #${stack.number}.${left} ${NO_PER_LAYER} If \`gh stack\` is an unknown command, run \`gh extension install github/gh-stack\`, then rerun that merge command.`,
  };
}
