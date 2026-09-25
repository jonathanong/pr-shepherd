import type { ApiUsage, GraphqlQuotaWarning } from "./api-usage.mts";
import type { MergeableState, MergeStateStatus, ReviewDecision } from "./github.mts";
import type { MergeQueueRemovalStatus } from "./merge-requirements.mts";
import type { ShepherdAction } from "./iterate.mts";

export interface PollSummaryChecks {
  passing?: number;
  failing?: number;
  inProgress?: number;
  skipped?: number;
  filtered?: number;
  ignored?: number;
  superseded?: number;
  incomplete?: true;
}

export interface PollSummaryReview {
  comments?: number;
  reviews?: number;
  threads?: number;
  actionable?: number;
  incomplete?: true;
}

/** The two GitHub refs at an adjacent, still-open stack boundary. */
export interface PollSummaryStackAncestry {
  parentPr: number;
  parentHeadRefName: string;
  parentHeadRefOid: string;
  childPr: number;
  childBaseRefName: string;
  childBaseRefOid: string;
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
  queueRemoval?: MergeQueueRemovalStatus;
  blockingReviewerInProgress?: true;
  remainingSeconds?: number;
  checks?: PollSummaryChecks;
  review?: PollSummaryReview;
  stack?: PollSummaryStack;
  pollCommand?: string;
  /**
   * `pollCommand` is one bounded tick without automatic mark-ready: it surfaces and routes review
   * or CI work but cannot advance this draft, so repeating it for a waiting layer changes nothing.
   */
  pollProbe?: true;
  /** A current one-PR READY-after-delay completion was verified. */
  readyReceipt?: true;
  /** Lowest unready ancestor that prevents this layer from being stack-mergeable. */
  blockedByPr?: number;
}

export type PollSummarySelection =
  | { kind: "prs"; requested: number[] }
  | { kind: "stack"; anchor: number; stackNumber: number; stackSize: number };

/** Aggregate-only transition; one-PR actions remain unchanged. */
export type StackNextAction = "shepherd" | "wait" | "merge" | "cancel" | "escalate";

export interface PollSummaryResult {
  mode: "summary";
  repo: string;
  selection: PollSummarySelection;
  reason: "actionable" | "all_terminal" | "waiting" | "timeout";
  prs: PollSummaryItem[];
  /** Present only for native-stack boundaries whose recorded refs differ. */
  stackAncestry?: PollSummaryStackAncestry[];
  /** Immediate stack transition; human blockers surface in rows while shepherdable work remains. */
  nextAction?: StackNextAction;
  /** Whether every open layer is independently ready and stack ancestry is linear. */
  stackMergeable?: boolean;
  instructions?: string[];
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
