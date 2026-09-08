import type { ApiUsage, GraphqlQuotaWarning } from "./api-usage.mts";
import type { MergeableState, MergeStateStatus, ReviewDecision } from "./github.mts";
import type { ShepherdAction } from "./iterate.mts";

export interface PollSummaryChecks {
  passing?: number;
  failing?: number;
  inProgress?: number;
  skipped?: number;
  filtered?: number;
  ignored?: number;
  incomplete?: true;
}

export interface PollSummaryReview {
  comments?: number;
  reviews?: number;
  threads?: number;
  actionable?: number;
  incomplete?: true;
}

interface PollSummaryStack {
  number: number;
  size: number;
  position: number;
  baseRefName: string;
}

export interface PollSummaryItem {
  pr: number;
  repo: string;
  title: string;
  url: string;
  /** Conservative routing hint; the selected one-PR poll makes the authoritative decision. */
  action: ShepherdAction;
  reasons: string[];
  state: "OPEN" | "CLOSED" | "MERGED" | "UNKNOWN";
  mergeable: MergeableState;
  mergeStateStatus: MergeStateStatus;
  reviewDecision?: ReviewDecision;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  isDraft?: true;
  isInMergeQueue?: true;
  checks?: PollSummaryChecks;
  review?: PollSummaryReview;
  stack?: PollSummaryStack;
  pollCommand?: string;
}

export type PollSummarySelection =
  | { kind: "prs"; requested: number[] }
  | { kind: "stack"; anchor: number; stackNumber: number; stackSize: number };

export interface PollSummaryResult {
  mode: "summary";
  repo: string;
  selection: PollSummarySelection;
  reason: "actionable" | "all_terminal" | "waiting" | "timeout";
  prs: PollSummaryItem[];
  apiUsage?: ApiUsage;
  quotaWarning?: GraphqlQuotaWarning;
}

export interface PollSummaryCommandOptions {
  prNumbers?: number[];
  stackPrNumber?: number;
  targetRepository?: { owner: string; name: string };
  merge?: boolean;
  readyDelaySeconds?: number;
  stallTimeoutSeconds?: number;
  noAutoMarkReady?: boolean;
  noAutoCancelActionable?: boolean;
}
