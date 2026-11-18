import type { PollSummaryItem, PollSummaryRuleAutoResolve } from "../types.mts";

/** One lean stack row shared by Markdown, JSON, and MCP. */
export interface StackLayerView {
  transport?: "rest";
  transportUnavailable?: Array<{ field: string; reason: string }>;
  pr: number;
  title: string;
  url: string;
  state: PollSummaryItem["state"];
  shepherded?: true;
  mergeable?: boolean;
  blocker?: string;
  author?: string;
  owned?: true;
  isDraft?: true;
  isInMergeQueue?: true;
  requiresMergeQueue?: boolean;
  position?: number;
  stackSize?: number;
  baseRefName: string;
  failing?: number;
  inProgress?: number;
  actionable?: number;
  checksIncomplete?: true;
  reviewIncomplete?: true;
  ruleAutoResolve?: PollSummaryRuleAutoResolve;
  trunkBehindBy?: number;
  trunkBehindUnknown?: true;
  queueRemoval?: { reason: string | null; actor?: string };
}

/** The `trunk behind` detail of a merge-top row, or undefined when trunk is not ahead. */
export function trunkDetail(layer: StackLayerView): string | undefined {
  if (layer.trunkBehindBy) return `trunk behind ${layer.trunkBehindBy}`;
  return layer.trunkBehindUnknown ? "trunk behind unknown" : undefined;
}

export function removalDetail(removal: StackLayerView["queueRemoval"]): string | undefined {
  if (!removal) return undefined;
  return `removed from merge queue (${removal.reason ?? "unknown reason"}${removal.actor ? ` by @${removal.actor}` : ""})`;
}
