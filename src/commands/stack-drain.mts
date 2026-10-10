import { findHumanHandoffs, appendHumanHandoffInstructions } from "./stack-handoffs.mts";
export { findHumanHandoffs, appendHumanHandoffInstructions } from "./stack-handoffs.mts";
import { stackMergeFlag } from "./stack-merge-flag.mts";
import type { PollSummaryItem, PollSummaryResult, StackNextAction } from "../types.mts";
import { stackLayerBlockReason } from "./stack-layer-readiness.mts";
import { appendMarkReadyInstructions, splitStackWork } from "./stack-work.mts";
import { getGithubTransport } from "../github/transport.mts";
import { buildMergeCommandPlan, renderMergeCommand } from "./iterate/merge.mts";

export interface StackPlan {
  action: StackNextAction;
  stackMergeable: boolean;
  waiting?: boolean;
  /** Set only by {@link idleWaitPlan}: the layers whose one-PR probes could only report waiting. */
  idle?: PollSummaryItem[];
  instructions: string[];
}

type StackLayer = PollSummaryItem & { stack: NonNullable<PollSummaryItem["stack"]> };

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
  const instructions: string[] = [];
  if (getGithubTransport() === "rest" || top.transport === "rest") {
    // Upper layers target their parent; the prefix merges into the stack trunk.
    const trunk = result.prs.find((item) => item.baseRefName === top.stack.baseRefName);
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
        number: top.stack.number,
        baseRefName: top.stack.baseRefName,
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
      return {
        action: "escalate",
        stackMergeable: false,
        instructions: [`1. ${plan.unavailable}`],
      };
    instructions[0] = `1. PR #${top.pr} is the highest ready layer of native stack #${top.stack.number}. Run \`${renderMergeCommand(plan.command)}\` to request merging ${span}. If status is \`pending\`, rerun that command at the configured cadence to resume its UUID. \`enqueued\` is not merged. Shepherd revalidates every open lower layer's READY receipt before submission.`;
  } else {
    const method = stackMergeFlag(result.allowedMergeMethods);
    if ("unavailable" in method)
      return {
        action: "escalate",
        stackMergeable: false,
        instructions: [`1. ${method.unavailable}`],
      };
    instructions[0] = `1. PR #${top.pr} is the highest open layer of stack #${top.stack.number} in \`${result.repo}\` whose open lower layers are all ready. Run \`GH_REPO=${result.repo} gh stack merge ${top.pr} --yes ${method.flag}\` to merge ${span}. If \`gh stack\` is an unknown command, run \`gh extension install github/gh-stack\` first. Do not rebase, push, or run \`gh stack push\`.`;
  }
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

export function isStackLayerReady(item: PollSummaryItem): boolean {
  return item.stack !== undefined && stackLayerBlockReason(item) === undefined;
}

export function stackPosition(item: PollSummaryItem): number {
  return item.stack?.position ?? Number.MAX_SAFE_INTEGER;
}

function isStackLayer(item: PollSummaryItem): item is StackLayer {
  return item.stack !== undefined;
}
