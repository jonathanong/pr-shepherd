import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { formatApiUsage, formatQuotaWarning } from "./api-usage-formatter.mts";
import { buildQuotaAwareContinuation } from "../quota-warning.mts";

export function formatPollSummaryResult(result: PollSummaryResult): string {
  const selection =
    result.selection.kind === "stack"
      ? `stack #${result.selection.stackNumber} anchored at PR #${result.selection.anchor} (${result.selection.stackSize} PRs)`
      : `PRs ${result.selection.requested.map((pr) => `#${pr}`).join(", ")}`;
  const lines = [
    `# Poll summary [${result.reason.toUpperCase()}]`,
    "",
    `**repo** \`${result.repo}\` · **selection** ${selection} · **mode** \`${result.mode}\``,
    "",
    "## Pull requests",
    "",
    ...result.prs.map(formatItem),
  ];
  const apiUsage = result.apiUsage ? formatApiUsage(result.apiUsage) : null;
  const quotaWarning = formatQuotaWarning(result.quotaWarning);
  if (quotaWarning) lines.push("", quotaWarning);
  if (apiUsage) lines.push("", apiUsage);
  lines.push("", "## Instructions", "", ...formatInstructions(result));
  return lines.join("\n");
}

function formatInstructions(result: PollSummaryResult): string[] {
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

function formatItem(item: PollSummaryItem): string {
  const flags = [item.isDraft ? "draft" : null, item.isInMergeQueue ? "queued" : null]
    .filter((value): value is string => value !== null)
    .join(", ");
  const stack = item.stack
    ? ` · stack \`${item.stack.number}\` position \`${item.stack.position}/${item.stack.size}\` base \`${item.stack.baseRefName}\``
    : "";
  const reviewDecision = item.reviewDecision ? ` · reviewDecision \`${item.reviewDecision}\`` : "";
  const stateFlags = flags ? ` · flags \`${flags}\`` : "";
  const checks = item.checks;
  const review = item.review;
  const incomplete = [checks?.incomplete ? "checks" : null, review?.incomplete ? "review" : null]
    .filter((value): value is string => value !== null)
    .join(", ");
  const incompleteText = incomplete ? `, incomplete: ${incomplete}` : "";
  return [
    `- [PR #${item.pr}: ${escapeMarkdownText(item.title)}](${item.url}) [${item.action.toUpperCase()}]`,
    `  - state \`${item.state}\` · mergeable \`${item.mergeable}\` · merge \`${item.mergeStateStatus}\`${reviewDecision}${stateFlags}${stack}`,
    `  - head \`${item.headRefName}\` at \`${item.headRefOid}\` · base \`${item.baseRefName}\``,
    ...(checks ? [`  - checks: ${formatCounts(checks, incompleteText)}`] : []),
    ...(review
      ? [`  - review: ${formatCounts(review, review.incomplete ? ", incomplete" : "")}`]
      : []),
    `  - reasons: ${item.reasons.map((reason) => `\`${reason}\``).join(", ")}`,
    ...(item.pollCommand ? [`  - pollCommand: \`${item.pollCommand}\``] : []),
  ].join("\n");
}

function formatCounts(counts: object, suffix: string): string {
  const plural: Record<string, string> = { inProgress: "in progress" };
  const singular: Record<string, string> = {
    comments: "comment",
    reviews: "review",
    threads: "thread",
  };
  const rendered = Object.entries(counts as Record<string, number | true | undefined>)
    .filter(([, count]) => typeof count === "number")
    .map(
      ([name, count]) =>
        `${count} ${count === 1 ? (singular[name] ?? name) : (plural[name] ?? name)}`,
    )
    .join(", ");
  return rendered ? `${rendered}${suffix}` : suffix.replace(/^, /, "");
}

function escapeMarkdownText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/([\\[\]])/g, "\\$1");
}
