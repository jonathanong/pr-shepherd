import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { formatApiUsage, formatQuotaWarning } from "./api-usage-formatter.mts";
import { withPollSummaryInstructions } from "../commands/poll-summary-instructions.mts";

export function formatPollSummaryResult(result: PollSummaryResult): string {
  const selection =
    result.selection.kind === "stack"
      ? `stack #${result.selection.stackNumber} anchored at PR #${result.selection.anchor} (${result.selection.stackSize} PRs)`
      : `PRs ${result.selection.requested.map((pr) => `#${pr}`).join(", ")}`;
  const lines = [
    `# Poll summary [${result.reason.toUpperCase()}]`,
    "",
    `**repo** \`${result.repo}\` · **selection** ${selection} · **mode** \`${result.mode}\`${result.nextAction ? ` · **next action** \`${result.nextAction}\`` : ""}`,
    "",
    "## Pull requests",
    "",
    ...result.prs.map(formatItem),
  ];
  if (result.stackAncestry?.length) {
    lines.push("", "## Stack ancestry", "");
    for (const pair of result.stackAncestry) {
      lines.push(
        `- PR #${pair.childPr} base \`${pair.childBaseRefName}\` at \`${pair.childBaseRefOid}\` differs from parent PR #${pair.parentPr} head \`${pair.parentHeadRefName}\` at \`${pair.parentHeadRefOid}\`.`,
      );
    }
  }
  const apiUsage = result.apiUsage ? formatApiUsage(result.apiUsage) : null;
  const quotaWarning = formatQuotaWarning(result.quotaWarning);
  if (quotaWarning) lines.push("", quotaWarning);
  if (apiUsage) lines.push("", apiUsage);
  const instructions =
    result.instructions ?? withPollSummaryInstructions(result, false).instructions ?? [];
  lines.push("", "## Instructions", "", ...instructions);
  return lines.join("\n");
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
  const blockingReviewer = item.blockingReviewerInProgress
    ? " · blocking reviewer `in progress`"
    : "";
  const readyDelay =
    item.remainingSeconds !== undefined ? ` · ready delay \`${item.remainingSeconds}s\`` : "";
  const checks = item.checks;
  const review = item.review;
  return [
    `- [PR #${item.pr}: ${escapeMarkdownText(item.title)}](${item.url}) [${item.action.toUpperCase()}]`,
    `  - state \`${item.state}\` · mergeable \`${item.mergeable}\` · merge \`${item.mergeStateStatus}\`${reviewDecision}${stateFlags}${blockingReviewer}${readyDelay}${stack}`,
    `  - head \`${item.headRefName}\` at \`${item.headRefOid}\` · base \`${item.baseRefName}\``,
    ...(checks
      ? [`  - checks: ${formatCounts(checks, checks.incomplete ? ", incomplete" : "")}`]
      : []),
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
    inProgress: "in progress",
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
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n]+/g, " ")
    .replace(/([\\[\]])/g, "\\$1");
}
