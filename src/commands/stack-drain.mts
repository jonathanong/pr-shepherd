import type { PollSummaryItem, PollSummaryResult, StackNextAction } from "../types.mts";
import { stackLayerBlockReason } from "./stack-layer-readiness.mts";

export interface StackPlan {
  action: StackNextAction;
  stackMergeable: boolean;
  waiting?: boolean;
  instructions: string[];
}

type StackLayer = PollSummaryItem & { stack: NonNullable<PollSummaryItem["stack"]> };

/**
 * The lowest open layer when it can merge by itself: every layer below it
 * merged, GitHub retargeted it onto the stack base, it holds a current READY
 * receipt, and no layer is already in the merge queue.
 */
export function drainableBottom(result: PollSummaryResult): StackLayer | undefined {
  const layers = [...result.prs].sort((left, right) => stackPosition(left) - stackPosition(right));
  const bottom = layers.find((item) => item.state !== "MERGED");
  if (!bottom || !isStackLayer(bottom) || bottom.state !== "OPEN") return undefined;
  if (bottom.action === "escalate" || !isStackLayerReady(bottom)) return undefined;
  if (bottom.baseRefName !== bottom.stack.baseRefName) return undefined;
  if (result.stackAncestry?.some((gap) => gap.childPr === bottom.pr)) return undefined;
  if (layers.some((item) => item.state === "OPEN" && item.isInMergeQueue)) return undefined;
  return bottom;
}

/** Merge the ready bottom layer by PR number once no same-numbered stack can capture it. */
export function planBottomDrain(
  result: PollSummaryResult,
  mergeRequested: boolean,
): StackPlan | undefined {
  if (!mergeRequested) return undefined;
  const bottom = drainableBottom(result);
  if (bottom?.mergeSelector?.status !== "verified") return undefined;
  const gaps = result.stackAncestry ?? [];
  const open = result.prs.filter((item) => item.state === "OPEN");
  const uppers = open.filter(
    (item) =>
      item.pr !== bottom.pr &&
      item.action !== "escalate" &&
      (!isStackLayerReady(item) || gaps.some((gap) => gap.childPr === item.pr)),
  );
  const instructions = [
    `1. PR #${bottom.pr} is the bottom open layer of stack #${bottom.stack.number} in \`${result.repo}\` and is ready. Run \`GH_REPO=${result.repo} gh stack merge ${bottom.pr} --yes --squash\` to merge that layer alone, or to enqueue it when the base uses a merge queue. If \`gh stack\` is an unknown command, run \`gh extension install github/gh-stack\` first.`,
  ];
  appendAutonomousInstructions(instructions, uppers);
  instructions.push(
    `${instructions.length + 1}. After the merge attempt, rerun this same \`--stack --merge\` selector; GitHub retargets the next layer onto \`${bottom.stack.baseRefName}\`. Shepherd any layer that GitHub rejects or ejects.`,
  );
  return {
    action: "merge",
    stackMergeable: gaps.length === 0 && open.every(isStackLayerReady),
    instructions,
  };
}

/**
 * A merge-requested, fully ready stack whose bottom open layer cannot be named
 * safely yet: GitHub has not retargeted it, or its PR number was not proven
 * free of a same-numbered stack.
 */
export function withheldMergePlan(first: PollSummaryItem): StackPlan {
  const instruction =
    first.baseRefName === first.stack?.baseRefName
      ? `1. Shepherd could not confirm that no native stack is numbered #${first.pr} (see its merge selector above), so it withholds the merge command. Recheck at the configured polling cadence.`
      : `1. PR #${first.pr} still targets \`${first.baseRefName}\` rather than \`${first.stack?.baseRefName}\`; wait for GitHub to retarget it before merging. Recheck at the configured polling cadence.`;
  return { action: "wait", stackMergeable: true, waiting: true, instructions: [instruction] };
}

export function appendAutonomousInstructions(
  instructions: string[],
  candidates: PollSummaryItem[],
): void {
  if (candidates.length === 0) return;
  instructions.push(
    `${instructions.length + 1}. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.`,
  );
  for (const item of candidates) {
    instructions.push(
      item.pollCommand
        ? `${instructions.length + 1}. Run \`${item.pollCommand}\` for PR #${item.pr}${item.blockedByPr ? ` (stack-blocked by PR #${item.blockedByPr})` : ""}${item.queueRemoval ? `; GitHub removed it from the merge queue (${item.queueRemoval.reason ?? "unknown reason"})` : ""}.`
        : `${instructions.length + 1}. PR #${item.pr} needs a one-PR Shepherd session, but no command was available.`,
    );
  }
  instructions.push(
    `${instructions.length + 1}. Keep upper draft PRs in draft until every lower layer has completed Shepherd READY.`,
  );
}

export function isStackLayerReady(item: PollSummaryItem): boolean {
  return item.stack !== undefined && stackLayerBlockReason(item) === undefined;
}

export function stackPosition(item: PollSummaryItem): number {
  return item.stack?.position ?? Number.MAX_SAFE_INTEGER;
}

function isStackLayer(item: PollSummaryItem): item is StackLayer {
  return item.stack !== undefined;
}
