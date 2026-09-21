/* eslint-disable max-lines */
import { buildQuotaAwareContinuation } from "../quota-warning.mts";
import type { PollSummaryItem, PollSummaryResult, StackNextAction } from "../types.mts";
import { explicitInstructions } from "./poll-summary-explicit-instructions.mts";

/** Keep aggregate JSON, Markdown, and MCP instructions on one projection. */
export function withPollSummaryInstructions(
  result: PollSummaryResult,
  mergeRequested: boolean,
): PollSummaryResult {
  if (result.selection.kind !== "stack") {
    return { ...result, instructions: explicitInstructions(result) };
  }

  const prs = [...result.prs].sort((left, right) => position(left) - position(right));
  const staleChildren = new Set(result.stackAncestry?.map((gap) => gap.childPr) ?? []);
  const firstUnready = prs.find(
    (item) => item.state === "OPEN" && (!isReady(item) || staleChildren.has(item.pr)),
  );
  const blocked = prs.map((item) =>
    firstUnready && item.state === "OPEN" && position(item) > position(firstUnready)
      ? {
          ...item,
          ...(["cancel", "mark_ready", "merge"].includes(item.action) && {
            action: "wait" as const,
            reasons: [...item.reasons, "lower-layer-not-ready"],
          }),
          blockedByPr: firstUnready.pr,
          ...(item.isDraft &&
            item.pollCommand && {
              pollCommand:
                item.pollCommand.replace(" --until-terminal", " --timeout 1s --debounce 0s") +
                (item.pollCommand.includes("--no-auto-mark-ready") ? "" : " --no-auto-mark-ready"),
            }),
        }
      : item.state === "OPEN" &&
          (!isReady(item) || staleChildren.has(item.pr)) &&
          ["cancel", "merge"].includes(item.action)
        ? {
            ...item,
            action: "fix_code" as const,
            reasons: [
              ...item.reasons,
              staleChildren.has(item.pr) ? "stale-ancestry" : "ready-receipt-required",
            ],
          }
        : item,
  );
  const projected = {
    ...result,
    prs: blocked.map((item) => {
      if (item.state === "OPEN" && item.isInMergeQueue && item.action === "cancel") {
        return {
          ...item,
          action: "wait" as const,
          reasons: [...item.reasons, "already-in-merge-queue"],
        };
      }
      if (item.state === "CLOSED" && closedDependency(blocked, item.pr)) {
        return {
          ...item,
          action: "escalate" as const,
          reasons: [...item.reasons, "closed-unmerged-dependency"],
        };
      }
      if (item.state !== "OPEN" && item.state !== "MERGED") {
        return {
          ...item,
          action: "escalate" as const,
          reasons: [...item.reasons, "unverified-stack-state"],
        };
      }
      return item;
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
  };
}

interface StackPlan {
  action: StackNextAction;
  stackMergeable: boolean;
  waiting?: boolean;
  instructions: string[];
}

function planStack(result: PollSummaryResult, mergeRequested: boolean): StackPlan {
  const open = result.prs.filter((item) => item.state === "OPEN");
  const lastOpen = open.at(-1);
  const closedDependencyPr = result.prs.find(
    (item) => item.state === "CLOSED" && lastOpen && position(item) < position(lastOpen),
  );
  const unverifiedLayer = result.prs.find(
    (item) => item.state !== "OPEN" && item.state !== "MERGED",
  );
  const gaps = result.stackAncestry ?? [];
  const stackMergeable = gaps.length === 0 && open.every(isReady);
  const candidates = open.filter(
    (item) => !isReady(item) || gaps.some((gap) => gap.childPr === item.pr),
  );
  const autonomousCandidates = candidates.filter((item) => item.action !== "escalate");
  const runnableCandidates = autonomousCandidates.filter((item) => item.pollCommand);
  const missingCommands = autonomousCandidates.filter((item) => !item.pollCommand);
  const escalated = result.prs.filter((item) => item.action === "escalate");

  if (closedDependencyPr || unverifiedLayer || escalated.length > 0) {
    const instructions: string[] = [];
    appendAutonomousInstructions(instructions, runnableCandidates);
    const stop = runnableCandidates.length === 0;
    if (closedDependencyPr) {
      instructions.push(
        `${instructions.length + 1}. PR #${closedDependencyPr.pr} was closed without merging below an open layer. ${stop ? "Stop and ask" : "After autonomous shepherding, ask"} the stack owner whether to restore that dependency or rebuild the upper branches.`,
      );
    }
    if (unverifiedLayer && unverifiedLayer.pr !== closedDependencyPr?.pr) {
      instructions.push(
        `${instructions.length + 1}. PR #${unverifiedLayer.pr} has state \`${unverifiedLayer.state}\` rather than open or merged. ${stop ? "Stop and ask" : "After autonomous shepherding, ask"} the stack owner to reconcile this layer before declaring the stack complete.`,
      );
    }
    for (const item of escalated) {
      if (item.pr === closedDependencyPr?.pr || item.pr === unverifiedLayer?.pr) continue;
      instructions.push(
        `${instructions.length + 1}. PR #${item.pr} requires human action (${item.reasons.join(", ")}). ${stop ? "Stop for that decision." : "Keep shepherding other PRs before the handoff."}`,
      );
    }
    for (const item of missingCommands) {
      instructions.push(
        `${instructions.length + 1}. PR #${item.pr} needs a one-PR session, but Shepherd could not produce its command. Ask for direction.`,
      );
    }
    if (runnableCandidates.length > 0) {
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
      for (const item of missingCommands) {
        instructions.push(
          `${instructions.length + 1}. PR #${item.pr} needs a one-PR session, but Shepherd could not produce its command. ${runnableCandidates.length === 0 ? "Stop and ask" : "After autonomous shepherding, ask"} for direction.`,
        );
      }
      if (runnableCandidates.length > 0) {
        instructions.push(
          `${instructions.length + 1}. After the listed one-PR sessions, rerun this same \`--stack\` selector. Stop for the human handoff only when no autonomous shepherding remains.`,
        );
      }
      return {
        action: runnableCandidates.length > 0 ? "shepherd" : "escalate",
        stackMergeable: false,
        instructions,
      };
    }
    const instructions: string[] = [];
    appendAutonomousInstructions(instructions, autonomousCandidates);
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

  const stackNumber = result.selection.kind === "stack" ? result.selection.stackNumber : 0;
  return {
    action: "merge",
    stackMergeable: true,
    instructions: [
      "1. Check `gh stack merge --help`. If the `gh-stack` extension is unavailable, run `gh extension install github/gh-stack`, then rerun this same `--stack --merge` selector before merging.",
      `2. Stack #${stackNumber} in \`${result.repo}\` is mergeable through PR #${open.at(-1)!.pr}. Run \`GH_REPO=${result.repo} gh stack merge --yes --squash ${stackNumber}\` to merge the whole native stack or enqueue it when the base uses a merge queue.`,
      "3. After the merge attempt, rerun this same `--stack --merge` selector until every layer is merged (`CANCEL`); shepherd any layer that GitHub rejects or ejects.",
    ],
  };
}

function closedDependency(items: PollSummaryItem[], pr: number): boolean {
  const open = items.filter((item) => item.state === "OPEN");
  const lastOpen = open.at(-1);
  return Boolean(
    lastOpen &&
    items.some(
      (item) => item.pr === pr && item.state === "CLOSED" && position(item) < position(lastOpen),
    ),
  );
}

function appendAutonomousInstructions(instructions: string[], candidates: PollSummaryItem[]): void {
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

function isReady(item: PollSummaryItem): boolean {
  return (
    item.state === "OPEN" &&
    item.stack !== undefined &&
    item.readyReceipt === true &&
    !item.isDraft &&
    !item.queueRemoval &&
    item.mergeable !== "CONFLICTING" &&
    item.mergeStateStatus !== "DIRTY" &&
    (item.isInMergeQueue || item.mergeable === "MERGEABLE") &&
    (item.isInMergeQueue ||
      !["DIRTY", "BEHIND", "UNKNOWN", "BLOCKED", "HAS_HOOKS"].includes(item.mergeStateStatus)) &&
    (item.checks?.failing ?? 0) === 0 &&
    (item.isInMergeQueue || (item.checks?.inProgress ?? 0) === 0) &&
    (item.review?.actionable ?? 0) === 0
  );
}

function position(item: PollSummaryItem): number {
  return item.stack?.position ?? Number.MAX_SAFE_INTEGER;
}
