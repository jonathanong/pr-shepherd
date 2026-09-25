/* eslint-disable max-lines */
import { buildQuotaAwareContinuation } from "../quota-warning.mts";
import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { explicitInstructions } from "./poll-summary-explicit-instructions.mts";
import {
  appendAutonomousInstructions,
  appendHumanHandoffInstructions,
  findHumanHandoffs,
  idleWaitPlan,
  isStackLayerReady,
  planPrefixDrain,
  retargetWaitPlan,
  stackPosition,
  type StackPlan,
} from "./stack-drain.mts";
import { appendMarkReadyInstructions, splitStackWork } from "./stack-work.mts";

/** Keep aggregate JSON, Markdown, and MCP instructions on one projection. */
export function withPollSummaryInstructions(
  result: PollSummaryResult,
  mergeRequested: boolean,
): PollSummaryResult {
  return planPollSummary(result, mergeRequested).result;
}

/** The projected summary, plus the idle layers when the stack plan can only wait on them. */
export function planPollSummary(
  result: PollSummaryResult,
  mergeRequested: boolean,
): { result: PollSummaryResult; idle?: PollSummaryItem[] } {
  if (result.selection.kind !== "stack") {
    return { result: { ...result, instructions: explicitInstructions(result) } };
  }

  const prs = [...result.prs].sort((left, right) => stackPosition(left) - stackPosition(right));
  const staleChildren = new Set(result.stackAncestry?.map((gap) => gap.childPr) ?? []);
  const projected = {
    ...result,
    prs: prs.map((item) => {
      const needsOwnSession =
        item.state === "OPEN" &&
        (!isStackLayerReady(item) || staleChildren.has(item.pr)) &&
        ["cancel", "merge"].includes(item.action);
      const layer = needsOwnSession
        ? {
            ...item,
            action: "fix_code" as const,
            reasons: [
              ...item.reasons,
              staleChildren.has(item.pr) ? "stale-ancestry" : "ready-receipt-required",
            ],
          }
        : item;
      if (layer.state === "OPEN" && layer.isInMergeQueue && layer.action === "cancel") {
        return {
          ...layer,
          action: "wait" as const,
          reasons: [...layer.reasons, "already-in-merge-queue"],
        };
      }
      if (layer.state === "CLOSED" && closedDependency(prs, layer.pr)) {
        return {
          ...layer,
          action: "escalate" as const,
          reasons: [...layer.reasons, "closed-unmerged-dependency"],
        };
      }
      if (layer.state !== "OPEN" && layer.state !== "MERGED") {
        return {
          ...layer,
          action: "escalate" as const,
          reasons: [...layer.reasons, "unverified-stack-state"],
        };
      }
      return layer;
    }),
  };
  const planned = planStack(projected, mergeRequested);
  const instructions = [...planned.instructions];
  if (result.quotaWarning && planned.action === "shepherd") {
    instructions.push(
      buildQuotaAwareContinuation(
        result.quotaWarning,
        `${instructions.length + 1}. After completing the stack action,`,
      ),
    );
  }
  return {
    result: {
      ...projected,
      reason:
        planned.action === "cancel"
          ? "all_terminal"
          : planned.waiting
            ? result.reason === "timeout"
              ? "timeout"
              : "waiting"
            : "actionable",
      stackMergeable: planned.stackMergeable,
      nextAction: planned.action,
      instructions,
    },
    ...(planned.idle && { idle: planned.idle }),
  };
}

function planStack(result: PollSummaryResult, mergeRequested: boolean): StackPlan {
  const open = result.prs.filter((item) => item.state === "OPEN");
  const gaps = result.stackAncestry ?? [];
  const staleChildren = new Set(gaps.map((gap) => gap.childPr));
  const stackMergeable = gaps.length === 0 && open.every(isStackLayerReady);
  const work = splitStackWork(
    open.filter(
      (item) =>
        (!isStackLayerReady(item) || staleChildren.has(item.pr)) && item.action !== "escalate",
    ),
    staleChildren,
  );
  const runnableCandidates = work.sessions.filter((item) => item.pollCommand);
  const missingCommands = work.sessions.filter((item) => !item.pollCommand);
  const agentWork = runnableCandidates.length > 0 || work.markReady.length > 0;
  const drain = planPrefixDrain(result, mergeRequested);
  if (drain) return drain;

  const handoffs = findHumanHandoffs(result);
  if (handoffs) {
    const instructions: string[] = [];
    appendAutonomousInstructions(instructions, runnableCandidates);
    appendMarkReadyInstructions(instructions, work.markReady);
    const stop = !agentWork;
    appendHumanHandoffInstructions(instructions, handoffs, stop);
    for (const item of missingCommands) {
      instructions.push(
        `${instructions.length + 1}. PR #${item.pr} needs a one-PR session, but Shepherd could not produce its command. Ask for direction.`,
      );
    }
    if (agentWork) {
      instructions.push(
        `${instructions.length + 1}. After the listed one-PR sessions, rerun this same \`--stack\` selector. Stop for the human handoff only when no autonomous shepherding remains.`,
      );
    }
    return { action: stop ? "escalate" : "shepherd", stackMergeable: false, instructions };
  }

  if (open.length === 0) {
    return {
      action: "cancel",
      stackMergeable: true,
      instructions: ["1. Stop — every stack layer is merged."],
    };
  }

  if (!stackMergeable) {
    if (missingCommands.length > 0) {
      const instructions: string[] = [];
      appendAutonomousInstructions(instructions, runnableCandidates);
      appendMarkReadyInstructions(instructions, work.markReady);
      for (const item of missingCommands) {
        instructions.push(
          `${instructions.length + 1}. PR #${item.pr} needs a one-PR session, but Shepherd could not produce its command. ${agentWork ? "After autonomous shepherding, ask" : "Stop and ask"} for direction.`,
        );
      }
      if (agentWork) {
        instructions.push(
          `${instructions.length + 1}. After the listed one-PR sessions, rerun this same \`--stack\` selector. Stop for the human handoff only when no autonomous shepherding remains.`,
        );
      }
      return { action: agentWork ? "shepherd" : "escalate", stackMergeable: false, instructions };
    }
    if (!agentWork) return idleWaitPlan(work.idle);
    const instructions: string[] = [];
    appendAutonomousInstructions(instructions, work.sessions);
    appendMarkReadyInstructions(instructions, work.markReady);
    instructions.push(
      `${instructions.length + 1}. After the selected one-PR sessions, rerun this same \`--stack\` selector.`,
    );
    return { action: "shepherd", stackMergeable: false, instructions };
  }

  if (open.some((item) => item.isInMergeQueue)) {
    return {
      action: "wait",
      stackMergeable: true,
      waiting: true,
      instructions: [
        "1. The stack is in the merge queue. Recheck at the configured polling cadence; finish only after every layer is merged, and route any ejected layer to its one-PR session.",
      ],
    };
  }

  if (!mergeRequested && result.prs.every((item) => item.action === "cancel")) {
    return {
      action: "cancel",
      stackMergeable: true,
      instructions: ["1. Stop — every stack layer is terminal or fully READY."],
    };
  }

  if (!mergeRequested) {
    const instructions: string[] = [];
    appendAutonomousInstructions(
      instructions,
      open.filter((item) => item.action !== "cancel"),
    );
    instructions.push(
      `${instructions.length + 1}. After the selected one-PR sessions, rerun this same \`--stack\` selector.`,
    );
    return {
      action: "shepherd",
      stackMergeable,
      instructions,
    };
  }

  return retargetWaitPlan(open[0]!);
}

function closedDependency(items: PollSummaryItem[], pr: number): boolean {
  const open = items.filter((item) => item.state === "OPEN");
  const lastOpen = open.at(-1);
  return Boolean(
    lastOpen &&
    items.some(
      (item) =>
        item.pr === pr && item.state === "CLOSED" && stackPosition(item) < stackPosition(lastOpen),
    ),
  );
}
