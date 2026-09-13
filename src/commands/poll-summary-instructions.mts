import { buildQuotaAwareContinuation } from "../quota-warning.mts";
import type { PollSummaryItem, PollSummaryResult, ShepherdAction } from "../types.mts";

/** Keep aggregate JSON, Markdown, and MCP instructions on one projection. */
export function withPollSummaryInstructions(
  result: PollSummaryResult,
  mergeRequested: boolean,
): PollSummaryResult {
  if (result.selection.kind !== "stack") {
    return { ...result, instructions: explicitInstructions(result) };
  }

  const planned = planStack(result, mergeRequested);
  const reason =
    planned.action === "cancel"
      ? "all_terminal"
      : planned.action === "wait"
        ? result.reason === "timeout"
          ? "timeout"
          : "waiting"
        : "actionable";
  const instructions = [...planned.instructions];
  if (result.quotaWarning && planned.action !== "wait" && planned.action !== "cancel") {
    instructions.push(
      buildQuotaAwareContinuation(
        result.quotaWarning,
        `${instructions.length + 1}. After completing the stack action,`,
      ),
    );
  }
  return { ...result, reason, nextAction: planned.action, instructions };
}

function planStack(
  result: PollSummaryResult,
  mergeRequested: boolean,
): { action: ShepherdAction; instructions: string[] } {
  const open = result.prs.filter((item) => item.state === "OPEN");
  if (open.length === 0) {
    return { action: "cancel", instructions: ["1. Stop — every selected PR is terminal."] };
  }

  const gap = result.stackAncestry?.[0];
  const firstOpen = open[0]!;
  if (firstOpen.mergeStateStatus === "BEHIND") return rebaseWholeStack(result, firstOpen);
  if (mergeRequested) {
    const mergeTarget = readyLowerStackTarget(open, result.stackAncestry ?? []);
    if (mergeTarget) {
      const stackNumber = result.selection.kind === "stack" ? result.selection.stackNumber : 0;
      return {
        action: "merge",
        instructions: [
          `1. The contiguous ready lower stack ends at PR #${mergeTarget.pr}. Merge the native stack through that PR with \`gh stack merge --squash ${mergeTarget.pr}\`; verify that the selector names PR #${mergeTarget.pr} in stack #${stackNumber} before running it. This includes still-open lower layers and leaves higher layers open.`,
          "2. After GitHub completes the stack merge and updates the remaining branches, rerun the same aggregate `--stack` selector. If an ancestry mismatch remains, follow the rebase instructions returned then.",
        ],
      };
    }
    if (firstOpen.action === "wait") {
      return waitingStack(result);
    }
  }

  const firstWork = open.find((item) =>
    ["fix_code", "mark_ready", "escalate"].includes(item.action),
  );
  if (firstWork && (!gap || positionOf(result, firstWork.pr) <= positionOf(result, gap.childPr))) {
    return pollOneLayer(firstWork);
  }
  if (gap) {
    return {
      action: "fix_code",
      instructions: [
        `1. PR #${gap.childPr} still records base \`${gap.childBaseRefName}\` at \`${gap.childBaseRefOid}\`, while parent PR #${gap.parentPr} now ends at \`${gap.parentHeadRefName}\` \`${gap.parentHeadRefOid}\`. From a clean checkout of \`${result.repo}\`, check out the parent stack branch \`${gap.parentHeadRefName}\`.`,
        "2. Rebase the upstack branches onto that parent with `gh stack rebase --upstack --no-trunk`, resolve any conflicts, and push the rewritten branches with `gh stack push`.",
        "3. Rerun the same aggregate `--stack` selector and follow the next returned action.",
      ],
    };
  }
  const behind = open.find((item) => item.mergeStateStatus === "BEHIND");
  if (behind) return rebaseWholeStack(result, behind);
  if (firstWork) return pollOneLayer(firstWork);
  if (!mergeRequested && open.every((item) => item.action === "cancel")) {
    return {
      action: "cancel",
      instructions: ["1. Stop — every open stack layer is ready and the stack is linear."],
    };
  }
  return waitingStack(result);
}

function rebaseWholeStack(
  result: PollSummaryResult,
  behind: PollSummaryItem,
): { action: ShepherdAction; instructions: string[] } {
  return {
    action: "fix_code",
    instructions: [
      `1. GitHub reports PR #${behind.pr} is behind its base \`${behind.baseRefName}\`. From a clean checkout of \`${result.repo}\`, rebase the native stack from its trunk with \`gh stack rebase\`.`,
      "2. Resolve any conflicts, push the updated stack with `gh stack push`, and rerun the same aggregate `--stack` selector.",
    ],
  };
}

function readyLowerStackTarget(
  open: PollSummaryItem[],
  gaps: NonNullable<PollSummaryResult["stackAncestry"]>,
): PollSummaryItem | undefined {
  const mismatchedChildren = new Set(gaps.map((gap) => gap.childPr));
  let target: PollSummaryItem | undefined;
  for (const item of open) {
    if (mismatchedChildren.has(item.pr) || item.action !== "merge") break;
    target = item;
  }
  return target;
}

function positionOf(result: PollSummaryResult, pr: number): number {
  return result.prs.find((item) => item.pr === pr)?.stack?.position ?? Number.MAX_SAFE_INTEGER;
}

function pollOneLayer(item: PollSummaryItem): {
  action: ShepherdAction;
  instructions: string[];
} {
  if (!item.pollCommand) {
    return {
      action: "escalate",
      instructions: [
        `1. PR #${item.pr} needs attention, but GitHub returned no one-PR poll command.`,
      ],
    };
  }
  return {
    action: item.action,
    instructions: [
      `1. Work on the lowest actionable layer, PR #${item.pr}: run \`${item.pollCommand}\`.`,
      "2. Follow that one-PR poll's `## Instructions` until it returns `CANCEL` or `ESCALATE`.",
      "3. Rerun the aggregate `--stack` selector before acting on a higher layer.",
    ],
  };
}

function waitingStack(result: PollSummaryResult): {
  action: ShepherdAction;
  instructions: string[];
} {
  if (result.quotaWarning) {
    return {
      action: "wait",
      instructions: [
        buildQuotaAwareContinuation(
          result.quotaWarning,
          "1. This native stack is non-terminal. Before continuing,",
        ),
      ],
    };
  }
  return {
    action: "wait",
    instructions: ["1. Recheck this native stack after the lowest open layer changes state."],
  };
}

function explicitInstructions(result: PollSummaryResult): string[] {
  if (result.reason === "all_terminal") return ["1. Stop — every selected PR is terminal."];
  if (result.quotaWarning && result.reason !== "actionable") {
    return [
      buildQuotaAwareContinuation(
        result.quotaWarning,
        "1. This aggregate selection is non-terminal. Before continuing,",
      ),
    ];
  }
  if (result.reason === "waiting" || result.reason === "timeout") {
    return ["1. Run this aggregate selector again when the caller is ready to recheck."];
  }
  const instructions = [
    "1. Choose each non-WAIT, non-CANCEL row that can proceed independently and run or delegate its exact `pollCommand`.",
    "2. Follow each selected one-PR poll's `## Instructions` until it returns `CANCEL` or `ESCALATE`.",
    "3. Run this aggregate poll again after selected work completes; one row's `ESCALATE` does not stop work on other rows.",
  ];
  if (result.quotaWarning) {
    instructions[2] = buildQuotaAwareContinuation(
      result.quotaWarning,
      "3. After selected work completes,",
    );
  }
  return instructions;
}
