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
 * Highest open layer such that it and every open layer below it are ready to
 * merge together. `gh stack merge <PR>` lands that PR and every unmerged layer
 * below it. A merge queue accepts the same prefix and evaluates each layer
 * from the bottom; a failure ejects that layer and those above it.
 */
function readyPrefixTop(result: PollSummaryResult): StackLayer | undefined {
  const layers = [...result.prs].sort((left, right) => stackPosition(left) - stackPosition(right));
  if (layers.some((item) => item.state === "OPEN" && item.isInMergeQueue)) return undefined;
  const open = layers.filter((item) => item.state === "OPEN");
  const bottom = open[0];
  if (!bottom || !isStackLayer(bottom) || bottom.state !== "OPEN") return undefined;
  if (bottom.baseRefName !== bottom.stack.baseRefName) return undefined;
  const stale = new Set((result.stackAncestry ?? []).map((gap) => gap.childPr));
  let top: StackLayer | undefined;
  for (const item of open) {
    if (!isStackLayer(item)) break;
    if (item.action === "escalate" || !isStackLayerReady(item) || stale.has(item.pr)) break;
    if (
      layers.some((layer) => layer.state === "CLOSED" && stackPosition(layer) < stackPosition(item))
    )
      break;
    top = item;
  }
  return top;
}

/**
 * Merge the ready prefix by its highest PR number. `gh stack merge <n>` tries a
 * stack number first, but stack numbers come from the repository's issue and
 * pull request sequence, so a PR number never names a stack.
 */
export function planPrefixDrain(
  result: PollSummaryResult,
  mergeRequested: boolean,
): StackPlan | undefined {
  if (!mergeRequested) return undefined;
  const top = readyPrefixTop(result);
  if (!top) return undefined;
  const gaps = result.stackAncestry ?? [];
  const staleChildren = new Set(gaps.map((gap) => gap.childPr));
  const open = result.prs
    .filter((item) => item.state === "OPEN")
    .sort((left, right) => stackPosition(left) - stackPosition(right));
  const above = splitStackWork(
    open.filter(
      (item) =>
        stackPosition(item) > stackPosition(top) &&
        item.action !== "escalate" &&
        (!isStackLayerReady(item) || staleChildren.has(item.pr)),
    ),
    staleChildren,
  );
  const span =
    open[0]?.pr === top.pr ? "that layer alone" : `PR #${top.pr} and every unmerged layer below it`;
  const instructions = [
    `1. PR #${top.pr} is the highest open layer of stack #${top.stack.number} in \`${result.repo}\` whose open lower layers are all ready. Run \`GH_REPO=${result.repo} gh stack merge ${top.pr} --yes --squash\` to merge ${span}. When the base uses a merge queue, the same command queues that prefix together and GitHub evaluates each layer from the bottom; a failure ejects that layer and the layers above it. If \`gh stack\` is an unknown command, run \`gh extension install github/gh-stack\` first.`,
  ];
  appendAutonomousInstructions(instructions, above.sessions);
  appendMarkReadyInstructions(instructions, above.markReady);
  const handoffs = findHumanHandoffs(result);
  if (handoffs) appendHumanHandoffInstructions(instructions, handoffs, false);
  instructions.push(
    `${instructions.length + 1}. After the merge attempt, rerun this same \`--stack --merge\` selector; GitHub retargets the next layer onto \`${top.stack.baseRefName}\`. Shepherd any layer that GitHub rejects or ejects.`,
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

/** Every remaining layer only waits on CI or merge state. */
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

function sessionInstruction(item: PollSummaryItem): string {
  if (!item.owned) return ` PR #${item.pr} is not owned. Do not run a session for it.`;
  const removal = item.queueRemoval
    ? ` PR #${item.pr} was removed from the merge queue (\`${item.queueRemoval.reason ?? "unknown reason"}\`${item.queueRemoval.actor ? ` by @${item.queueRemoval.actor}` : ""}).`
    : "";
  if (!item.pollCommand) {
    return ` PR #${item.pr} needs a one-PR Shepherd session, but no command was available.`;
  }
  const queueNote = item.queueRemoval
    ? " That session fixes failing queue CI, or escalates when the removal has no concrete fix."
    : "";
  return `${removal} Run \`${item.pollCommand}\` for PR #${item.pr}.${queueNote}`;
}
export function describeIdleLayers(idle: PollSummaryItem[]): string {
  return idle.map((item) => `PR #${item.pr} (${item.reasons.join(", ")})`).join("; ");
}

export function appendAutonomousInstructions(
  instructions: string[],
  candidates: PollSummaryItem[],
): void {
  if (candidates.length === 0) return;
  instructions.push(
    `${instructions.length + 1}. Start or delegate one-PR sessions only for rows marked \`owned\`. Leave every other author's layer untouched. Owned layers can proceed concurrently.`,
  );
  for (const item of candidates) {
    instructions.push(`${instructions.length + 1}.${sessionInstruction(item)}`);
  }
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
