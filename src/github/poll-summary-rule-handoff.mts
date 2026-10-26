import type { PollSummaryItem } from "../types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

/**
 * A stack handoff clones the read before rows are evaluated. Reflect the rule-driven mutations the
 * rows confirmed so the one-PR session that consumes the handoff does not repeat them.
 */
export function patchHandoffLayers(layers: RawSummaryPr[], items: PollSummaryItem[]): void {
  for (const item of items) {
    const report = item.ruleAutoResolve;
    const layer = layers.find((candidate) => candidate.number === item.pr);
    if (!report || !layer) continue;
    const minimized = new Set(report.minimized?.map((entry) => entry.id));
    const resolved = new Set(report.threads?.map((thread) => thread.id));
    for (const node of [...layer.comments.nodes, ...layer.reviews.nodes])
      if (minimized.has(node.id)) node.isMinimized = true;
    for (const thread of layer.reviewThreads.nodes)
      if (resolved.has(thread.id)) thread.isResolved = true;
  }
}
