import type { PollSummaryItem } from "../types.mts";

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
  queueRemoval?: { reason: string | null; actor?: string };
}
