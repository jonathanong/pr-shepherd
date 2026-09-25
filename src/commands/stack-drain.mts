import type { PollSummaryItem, PollSummaryResult, StackNextAction } from "../types.mts";
import { stackLayerBlockReason } from "./stack-layer-readiness.mts";
import { appendMarkReadyInstructions, splitStackWork } from "./stack-work.mts";

export interface StackPlan {
  action: StackNextAction;
  stackMergeable: boolean;
  waiting?: boolean;
  /** Set only by {@link idleWaitPlan}: the layers whose one-PR probes could only report waiting. */
  idle?: PollSummaryItem[];
  instructions: string[];
}

type StackLayer = PollSummaryItem & { stack: NonNullable<PollSummaryItem["stack"]> };

/**
 * The lowest open layer when it can merge by itself: every layer below it
 * merged, GitHub retargeted it onto the stack base, it holds a current READY
 * receipt, and no layer is already in the merge queue.
 */
function drainableBottom(result: PollSummaryResult): StackLayer | undefined {
  const layers = [...result.prs].sort((left, right) => stackPosition(left) - stackPosition(right));
  const bottom = layers.find((item) => item.state !== "MERGED");
  if (!bottom || !isStackLayer(bottom) || bottom.state !== "OPEN") return undefined;
  if (bottom.action === "escalate" || !isStackLayerReady(bottom)) return undefined;
  if (bottom.baseRefName !== bottom.stack.baseRefName) return undefined;
  if (result.stackAncestry?.some((gap) => gap.childPr === bottom.pr)) return undefined;
  if (layers.some((item) => item.state === "OPEN" && item.isInMergeQueue)) return undefined;
  return bottom;
}

/**
 * Merge the ready bottom layer by PR number. `gh stack merge <n>` tries a stack
 * number first, but stack numbers come from the repository's issue and pull
 * request sequence, so a PR number never names a stack.
 */
export function planBottomDrain(
  result: PollSummaryResult,
  mergeRequested: boolean,
): StackPlan | undefined {
  if (!mergeRequested) return undefined;
  const bottom = drainableBottom(result);
  if (!bottom) return undefined;
  const gaps = result.stackAncestry ?? [];
  const staleChildren = new Set(gaps.map((gap) => gap.childPr));
  const open = result.prs.filter((item) => item.state === "OPEN");
  const uppers = splitStackWork(
    open.filter(
      (item) =>
        item.pr !== bottom.pr &&
        item.action !== "escalate" &&
        (!isStackLayerReady(item) || staleChildren.has(item.pr)),
    ),
    staleChildren,
  );
  const instructions = [
    `1. PR #${bottom.pr} is the bottom open layer of stack #${bottom.stack.number} in \`${result.repo}\` and is ready. Run \`GH_REPO=${result.repo} gh stack merge ${bottom.pr} --yes --squash\` to merge that layer alone, or to enqueue it when the base uses a merge queue. If \`gh stack\` is an unknown command, run \`gh extension install github/gh-stack\` first.`,
  ];
  appendAutonomousInstructions(instructions, uppers.sessions);
  appendMarkReadyInstructions(instructions, uppers.markReady);
  const handoffs = findHumanHandoffs(result);
  if (handoffs) appendHumanHandoffInstructions(instructions, handoffs, false);
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
 * A merge-requested, fully ready stack whose bottom open layer still targets
 * the merged layer below it until GitHub retargets it onto the stack base.
 */
export function retargetWaitPlan(first: PollSummaryItem): StackPlan {
  return {
    action: "wait",
    stackMergeable: true,
    waiting: true,
    instructions: [
      `1. PR #${first.pr} still targets \`${first.baseRefName}\` rather than \`${first.stack?.baseRefName}\`; wait for GitHub to retarget it before merging. Recheck at the configured polling cadence.`,
    ],
  };
}

/** Every remaining layer only waits: on CI or merge state, or on a lower layer that does. */
export function idleWaitPlan(idle: PollSummaryItem[]): StackPlan {
  return {
    action: "wait",
    stackMergeable: false,
    waiting: true,
    idle,
    instructions: [
      `1. No one-PR session can advance the stack yet: ${describeIdleLayers(idle)}. Recheck at the configured polling cadence.`,
    ],
  };
}

export function describeIdleLayers(idle: PollSummaryItem[]): string {
  return idle
    .map(
      (item) =>
        `PR #${item.pr} (${item.blockedByPr ? `stack-blocked by PR #${item.blockedByPr}` : item.reasons.join(", ")})`,
    )
    .join("; ");
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

/** Layers only a human can resolve: a closed dependency, an unverified state, or an escalation. */
export interface HumanHandoffs {
  closedDependency?: PollSummaryItem;
  unverified?: PollSummaryItem;
  escalated: PollSummaryItem[];
}

export function findHumanHandoffs(result: PollSummaryResult): HumanHandoffs | undefined {
  const lastOpen = result.prs.filter((item) => item.state === "OPEN").at(-1);
  const closedDependency = result.prs.find(
    (item) => item.state === "CLOSED" && lastOpen && stackPosition(item) < stackPosition(lastOpen),
  );
  const unverified = result.prs.find((item) => item.state !== "OPEN" && item.state !== "MERGED");
  const escalated = result.prs.filter((item) => item.action === "escalate");
  return closedDependency || unverified || escalated.length > 0
    ? { closedDependency, unverified, escalated }
    : undefined;
}

/** Name every human handoff; `stop` when no autonomous work precedes it. */
export function appendHumanHandoffInstructions(
  instructions: string[],
  { closedDependency, unverified, escalated }: HumanHandoffs,
  stop: boolean,
): void {
  const ask = stop ? "Stop and ask" : "After autonomous shepherding, ask";
  if (closedDependency) {
    instructions.push(
      `${instructions.length + 1}. PR #${closedDependency.pr} was closed without merging below an open layer. ${ask} the stack owner whether to restore that dependency or rebuild the upper branches.`,
    );
  }
  if (unverified && unverified.pr !== closedDependency?.pr) {
    instructions.push(
      `${instructions.length + 1}. PR #${unverified.pr} has state \`${unverified.state}\` rather than open or merged. ${ask} the stack owner to reconcile this layer before declaring the stack complete.`,
    );
  }
  for (const item of escalated) {
    if (item.pr === closedDependency?.pr || item.pr === unverified?.pr) continue;
    instructions.push(
      `${instructions.length + 1}. PR #${item.pr} requires human action (${item.reasons.join(", ")}). ${stop ? "Stop for that decision." : "Keep shepherding other PRs before the handoff."}`,
    );
  }
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
