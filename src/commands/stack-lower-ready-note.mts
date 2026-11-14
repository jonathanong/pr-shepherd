import { mergeReadyCommand } from "../github/poll-summary-command.mts";
import type { PollSummaryItem, PollSummaryResult, StackMergeScope } from "../types.mts";
import { mergeScopeLayers, readyPrefix, type StackLayer } from "./stack-merge-scope.mts";

const list = (items: PollSummaryItem[]): string => items.map((i) => `#${i.pr}`).join(", ");

/**
 * `--merge` or `--merge-through` found owned layers ready at the bottom while a higher owned layer
 * is not: nothing merges. Name the lagging layers' raw state and the explicit opt-in to drain.
 */
export function lowerReadyNote(
  result: PollSummaryResult,
  scope: StackMergeScope | undefined,
  rerunCommand?: string,
): string | undefined {
  if (!scope || scope.kind === "ready") return undefined;
  const { inScope, target } = mergeScopeLayers(result, scope);
  const prefix = readyPrefix(result, false).filter((item) => inScope.includes(item));
  if (!target || prefix.length === 0 || prefix.some((item) => item.pr === target.pr))
    return undefined;
  const lagging = inScope.filter((item) => !prefix.includes(item as StackLayer));
  const drain = rerunCommand
    ? `\`${mergeReadyCommand(rerunCommand)}\``
    : "`stack` with `--merge-ready`";
  return `Owned ${prefix.length === 1 ? "layer" : "layers"} ${list(prefix)} ${prefix.length === 1 ? "is" : "are"} ready, but ${lagging.map(describeLagging).join("; ")} ${lagging.length === 1 ? "is" : "are"} not. Nothing was merged because \`${scope.kind === "all" ? "--merge" : "--merge-through"}\` lands every layer in scope together. Tell the user the lower layers are ready. Only if the user asked to merge layers as they become ready, rerun ${drain}; otherwise keep shepherding.`;
}

function describeLagging(item: PollSummaryItem): string {
  const facts = [
    `action ${item.action}`,
    item.reasons.length > 0 ? `reasons ${item.reasons.join(", ")}` : undefined,
    item.isDraft ? "draft" : undefined,
    item.reviewDecision ? `review ${item.reviewDecision}` : undefined,
    item.checks?.failing ? `${item.checks.failing} failing checks` : undefined,
    item.checks?.inProgress ? `${item.checks.inProgress} checks in progress` : undefined,
    item.review?.actionable ? `${item.review.actionable} actionable review items` : undefined,
  ].filter((fact): fact is string => fact !== undefined);
  return `#${item.pr} (${facts.join("; ")})`;
}
