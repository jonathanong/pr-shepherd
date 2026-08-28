import type { IterateResult, IterateResultMerge } from "../types.mts";
import { renderMergeCommand } from "../commands/iterate/merge.mts";
import { inlineCode, joinSections } from "../util/markdown.mts";
import { buildSimpleIterateInstructions, numberInstructions } from "./iterate-instructions.mts";

export function appendMergeQueueHeader(lines: string[], result: IterateResult): void {
  const queue = result.mergeQueue;
  if (!queue) return;
  const parts = [`enabled \`${queue.enabled}\``, `inQueue \`${queue.inQueue}\``];
  if (queue.entry) {
    parts.push(`state \`${queue.entry.state}\``, `position \`${queue.entry.position}\``);
    if (queue.entry.estimatedTimeToMerge !== null) {
      parts.push(`estimatedTimeToMerge \`${queue.entry.estimatedTimeToMerge}\``);
    }
    if (queue.entry.enqueuedAtUnix !== undefined) {
      parts.push(`enqueuedAtUnix \`${queue.entry.enqueuedAtUnix}\``);
    }
    if (queue.entry.enqueuer) parts.push(`enqueuer \`@${queue.entry.enqueuer}\``);
    if (queue.entry.headCommitOid) parts.push(`headCommit \`${queue.entry.headCommitOid}\``);
  }
  if (queue.checkCommitOid) parts.push(`checkCommit \`${queue.checkCommitOid}\``);
  if (queue.checksIncomplete) parts.push("checks incomplete (first 100 shown)");
  if (queue.headUpdatedAfterRemoval) parts.push("head updated after removal");
  lines.push(`**merge queue** ${parts.join(" · ")}`);
  if (queue.autoMergeRequest) {
    lines.push(
      `**auto-merge** method \`${queue.autoMergeRequest.mergeMethod}\` · enabledAtUnix \`${queue.autoMergeRequest.enabledAtUnix}\`${queue.autoMergeRequest.enabledBy ? ` · by \`@${queue.autoMergeRequest.enabledBy}\`` : ""}`,
    );
  }
  if (queue.latestRemoval) {
    const removal = queue.latestRemoval;
    lines.push(
      `**queue removal** reason \`${removal.reason ?? "not provided"}\` · createdAtUnix \`${removal.createdAtUnix}\`${removal.actor ? ` · actor \`@${removal.actor}\`` : ""}${removal.beforeCommitOid ? ` · commit \`${removal.beforeCommitOid}\`` : ""}${removal.beforeCommitParentOids ? ` · parents \`${removal.beforeCommitParentOids.join(",")}\`` : ""}`,
    );
  }
}

export function formatMergeAction(header: string, result: IterateResultMerge): string {
  const commandLines = [
    `- ${result.merge.mode === "queue" ? "merge queue" : "auto-merge"}: ${inlineCode(renderMergeCommand(result.merge.command))}`,
  ];
  if (result.merge.fallbackCommand) {
    commandLines.push(
      `- plain merge fallback: ${inlineCode(renderMergeCommand(result.merge.fallbackCommand))}`,
    );
  }
  if (result.merge.queueApiFallbackCommand) {
    commandLines.push(
      `- queue API fallback: ${inlineCode(renderMergeCommand(result.merge.queueApiFallbackCommand))}`,
    );
  }
  return joinSections([
    header,
    `## Merge command\n\n${commandLines.join("\n")}`,
    `## Instructions\n\n${numberInstructions(buildSimpleIterateInstructions(result))}`,
  ]);
}
