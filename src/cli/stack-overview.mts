import { stackLayerBlockReason } from "../commands/stack-layer-readiness.mts";
import type {
  PollSummaryItem,
  PollSummaryResult,
  PollSummaryStackAncestry,
  StackNextAction,
} from "../types.mts";
import type { ApiUsage, GraphqlQuotaWarning } from "../types/api-usage.mts";
import { formatApiUsage, formatQuotaWarning } from "./api-usage-formatter.mts";

/** Agent-facing stack row. Planning keeps the richer PollSummaryItem. */
interface StackLayerView {
  pr: number;
  title: string;
  url: string;
  state: PollSummaryItem["state"];
  shepherded: boolean;
  mergeable: boolean;
  blocker?: string;
  author?: string;
  owned?: true;
  isDraft?: true;
  isInMergeQueue?: true;
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

export interface StackOverview {
  mode: "summary";
  repo: string;
  selection: Extract<PollSummaryResult["selection"], { kind: "stack" }>;
  reason: PollSummaryResult["reason"];
  stackMergeable?: boolean;
  nextAction?: StackNextAction;
  prs: StackLayerView[];
  stackAncestry?: PollSummaryStackAncestry[];
  instructions?: string[];
  apiUsage?: ApiUsage;
  quotaWarning?: GraphqlQuotaWarning;
}

/** Lean stack payload shared by Markdown, JSON, and MCP. */
export function projectStackOverview(result: PollSummaryResult): StackOverview {
  const selection = result.selection;
  if (selection.kind !== "stack") {
    throw new Error("projectStackOverview requires a stack selection");
  }
  const stale = new Set(result.stackAncestry?.map((gap) => gap.childPr) ?? []);
  return {
    mode: "summary",
    repo: result.repo,
    selection,
    reason: result.reason,
    ...(result.stackMergeable !== undefined && { stackMergeable: result.stackMergeable }),
    ...(result.nextAction && { nextAction: result.nextAction }),
    prs: result.prs.map((item) => projectLayer(item, stale.has(item.pr))),
    ...(result.stackAncestry?.length && { stackAncestry: result.stackAncestry }),
    ...(result.instructions?.length && { instructions: result.instructions }),
    ...(result.apiUsage && { apiUsage: result.apiUsage }),
    ...(result.quotaWarning && { quotaWarning: result.quotaWarning }),
  };
}

function projectLayer(item: PollSummaryItem, stale: boolean): StackLayerView {
  const blocker = layerBlocker(item, stale);
  const removal = item.queueRemoval;
  return {
    pr: item.pr,
    title: item.title,
    url: item.url,
    state: item.state,
    shepherded: item.readyReceipt === true,
    mergeable: blocker === undefined,
    ...(blocker && { blocker }),
    ...(item.authorLogin && { author: item.authorLogin }),
    ...(item.owned && { owned: true as const }),
    ...(item.isDraft && { isDraft: true as const }),
    ...(item.isInMergeQueue && { isInMergeQueue: true as const }),
    ...(item.stack && { position: item.stack.position, stackSize: item.stack.size }),
    baseRefName: item.baseRefName,
    ...(blocker === "failing-checks" &&
      (item.checks?.failing ?? 0) > 0 && { failing: item.checks?.failing }),
    ...(blocker === "checks-in-progress" &&
      (item.checks?.inProgress ?? 0) > 0 && { inProgress: item.checks?.inProgress }),
    ...(blocker === "review-work" &&
      (item.review?.actionable ?? 0) > 0 && { actionable: item.review?.actionable }),
    ...(item.checks?.incomplete && { checksIncomplete: true as const }),
    ...(item.review?.incomplete && { reviewIncomplete: true as const }),
    ...(removal && {
      queueRemoval: {
        reason: removal.reason,
        ...(removal.actor && { actor: removal.actor }),
      },
    }),
  };
}

/** Mergeability blocker. A missing receipt is "not shepherded", not a mergeability reason. */
function layerBlocker(item: PollSummaryItem, stale: boolean): string | undefined {
  if (item.action === "escalate") {
    return item.reasons.find((reason) => reason !== "appears-ready") ?? "escalate";
  }
  if (stale) return "stale-ancestry";
  const reason = stackLayerBlockReason(item);
  if (reason === undefined || reason === "no-ready-receipt") return undefined;
  return reason;
}

/** Skill stop tokens. Other stack actions stay untagged so the loop keeps running. */
function stackTerminalTag(nextAction: StackOverview["nextAction"]): string {
  if (nextAction === "cancel") return " [CANCEL]";
  if (nextAction === "escalate") return " [ESCALATE]";
  return "";
}

/** Markdown for a stack overview. */
export function formatStackOverview(overview: StackOverview): string {
  const stack = overview.selection;
  const lines = [
    `# ${overview.repo} stack #${stack.stackNumber}${stackTerminalTag(overview.nextAction)} — ${overview.reason}`,
    "",
    `Stack: #${stack.stackNumber} · anchor PR #${stack.anchor} · ${stack.stackSize} layers · mode \`${overview.mode}\``,
    ...(overview.stackMergeable !== undefined
      ? [`stackMergeable: ${overview.stackMergeable}`]
      : []),
    ...(overview.nextAction ? [`nextAction: ${overview.nextAction}`] : []),
    "",
    "## Layers",
    "",
    ...overview.prs.flatMap(formatLayerLines),
  ];
  if (overview.stackAncestry?.length) {
    lines.push("", "## Stack ancestry", "");
    for (const gap of overview.stackAncestry) {
      lines.push(
        `- PR #${gap.childPr} base \`${gap.childBaseRefName}\` at \`${gap.childBaseRefOid}\` differs from parent PR #${gap.parentPr} head \`${gap.parentHeadRefName}\` at \`${gap.parentHeadRefOid}\`.`,
      );
    }
  }
  if (overview.instructions?.length) {
    lines.push("", "## Instructions", "", ...overview.instructions);
  }
  const quota = formatQuotaWarning(overview.quotaWarning);
  const usage = formatApiUsage(overview.apiUsage);
  if (quota) lines.push("", quota);
  if (usage) lines.push("", usage);
  return lines.join("\n");
}

function formatLayerLines(layer: StackLayerView): string[] {
  const facts = [
    layer.shepherded ? "shepherded" : "not shepherded",
    layer.mergeable ? "mergeable" : `not mergeable (\`${layer.blocker ?? "unknown"}\`)`,
    layer.author ? `owner \`@${layer.author}\`` : undefined,
    layer.owned ? "owned" : undefined,
  ].filter((fact): fact is string => fact !== undefined);
  const details = [
    layer.state,
    layer.isDraft ? "draft" : undefined,
    layer.isInMergeQueue ? "in merge queue" : undefined,
    layer.position !== undefined && layer.stackSize !== undefined
      ? `position ${layer.position}/${layer.stackSize}`
      : undefined,
    `base \`${layer.baseRefName}\``,
    layer.failing ? `${layer.failing} failing` : undefined,
    layer.inProgress ? `${layer.inProgress} in progress` : undefined,
    layer.actionable ? `${layer.actionable} actionable` : undefined,
    layer.checksIncomplete ? "checks incomplete" : undefined,
    layer.reviewIncomplete ? "review incomplete" : undefined,
    layer.queueRemoval
      ? `removed from merge queue (${layer.queueRemoval.reason ?? "unknown reason"}${layer.queueRemoval.actor ? ` by @${layer.queueRemoval.actor}` : ""})`
      : undefined,
  ].filter((detail): detail is string => detail !== undefined);
  return [
    `- [PR #${layer.pr}: ${layer.title}](${layer.url}) — ${facts.join(" · ")}`,
    `  - ${details.join(" · ")}`,
  ];
}
