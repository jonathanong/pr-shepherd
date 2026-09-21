import { buildQuotaAwareContinuation } from "../quota-warning.mts";
import type { PollSummaryItem, PollSummaryResult, ShepherdAction } from "../types.mts";
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
      : item.state === "OPEN" && !isReady(item) && ["cancel", "merge"].includes(item.action)
        ? {
            ...item,
            action: "fix_code" as const,
            reasons: [...item.reasons, "ready-receipt-required"],
          }
        : item,
  );
  const projected = { ...result, prs: blocked };
  const planned = planStack(projected, mergeRequested);
  const instructions = [...planned.instructions];
  if (
    result.quotaWarning &&
    instructions.some((instruction) => instruction.includes("rerun this same"))
  ) {
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
  action: Extract<ShepherdAction, "cancel" | "escalate">;
  stackMergeable: boolean;
  waiting?: boolean;
  instructions: string[];
}

function planStack(result: PollSummaryResult, mergeRequested: boolean): StackPlan {
  const open = result.prs.filter((item) => item.state === "OPEN");
  const lastOpen = open.at(-1);
  const closedDependency = result.prs.find(
    (item) => item.state === "CLOSED" && lastOpen && position(item) < position(lastOpen),
  );
  if (closedDependency) {
    return {
      action: "escalate",
      stackMergeable: false,
      instructions: [
        `1. PR #${closedDependency.pr} was closed without merging below an open layer. Stop and ask the stack owner whether to restore that dependency or rebuild the upper branches.`,
      ],
    };
  }
  const unverifiedLayer = result.prs.find(
    (item) => item.state !== "OPEN" && item.state !== "MERGED",
  );
  if (unverifiedLayer) {
    return {
      action: "escalate",
      stackMergeable: false,
      instructions: [
        `1. PR #${unverifiedLayer.pr} has state \`${unverifiedLayer.state}\` rather than open or merged. Stop and ask the stack owner to reconcile this layer before declaring the stack complete.`,
      ],
    };
  }
  if (open.length === 0) {
    return {
      action: "cancel",
      stackMergeable: true,
      instructions: ["1. Stop — every stack layer is merged."],
    };
  }

  const gaps = result.stackAncestry ?? [];
  const stackMergeable = gaps.length === 0 && open.every(isReady);
  if (!stackMergeable) {
    const candidates = open.filter(
      (item) => !isReady(item) || gaps.some((gap) => gap.childPr === item.pr),
    );
    const withoutCommand = candidates.find((item) => !item.pollCommand);
    if (withoutCommand) {
      return {
        action: "escalate",
        stackMergeable: false,
        instructions: [
          `1. PR #${withoutCommand.pr} needs a one-PR session, but Shepherd could not produce its command. Stop and ask for direction.`,
        ],
      };
    }
    const instructions = [
      "1. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.",
      ...candidates.map((item, index) =>
        item.pollCommand
          ? `${index + 2}. Run \`${item.pollCommand}\` for PR #${item.pr}${item.blockedByPr ? ` (stack-blocked by PR #${item.blockedByPr})` : ""}${item.queueRemoval ? `; GitHub removed it from the merge queue (${item.queueRemoval.reason ?? "unknown reason"})` : ""}.`
          : `${index + 2}. PR #${item.pr} needs a one-PR Shepherd session, but no command was available.`,
      ),
    ];
    instructions.push(
      `${instructions.length + 1}. Keep upper draft PRs in draft until every lower layer has completed Shepherd READY.`,
    );
    instructions.push(
      `${instructions.length + 1}. After the selected one-PR sessions, rerun this same \`--stack\` selector.`,
    );
    return { action: "escalate", stackMergeable: false, instructions };
  }

  if (!mergeRequested) {
    return {
      action: "cancel",
      stackMergeable: true,
      instructions: [
        "1. Stop — every open stack layer completed Shepherd READY and ancestry is linear.",
      ],
    };
  }

  if (open.some((item) => item.isInMergeQueue)) {
    return {
      action: "escalate",
      stackMergeable: true,
      waiting: true,
      instructions: [
        "1. The stack is in the merge queue. Recheck at the configured polling cadence; finish only after every layer is merged, and route any ejected layer to its one-PR session.",
      ],
    };
  }

  const stackNumber = result.selection.kind === "stack" ? result.selection.stackNumber : 0;
  return {
    action: "escalate",
    stackMergeable: true,
    instructions: [
      `1. Stack #${stackNumber} in \`${result.repo}\` is mergeable through PR #${open.at(-1)!.pr}; this aggregate selector will not mutate it.`,
      "2. Hand off the native-stack merge to the stack owner. After a merge attempt, rerun this same `--stack --merge` selector to reconcile every layer; shepherd any layer that GitHub rejects or ejects.",
    ],
  };
}

function isReady(item: PollSummaryItem): boolean {
  return (
    item.state === "OPEN" &&
    item.readyReceipt === true &&
    !item.isDraft &&
    !item.queueRemoval &&
    (item.isInMergeQueue || item.mergeable !== "CONFLICTING") &&
    (item.isInMergeQueue || !["DIRTY", "BEHIND", "UNKNOWN"].includes(item.mergeStateStatus)) &&
    (item.checks?.failing ?? 0) === 0 &&
    (item.isInMergeQueue || (item.checks?.inProgress ?? 0) === 0) &&
    (item.review?.actionable ?? 0) === 0
  );
}

function position(item: PollSummaryItem): number {
  return item.stack?.position ?? Number.MAX_SAFE_INTEGER;
}
