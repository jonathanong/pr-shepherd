import type { MergeRequirements } from "../types.mts";

const REQUIRED = "[Required]";
const NOT_REQUIRED = "[Not Required]";

export function formatMergeRequirementLines(req: MergeRequirements): string[] {
  const lines = [
    formatApprovals(req.approvals.current, req.approvals.requiredCount),
    formatConversations(req.conversationsResolved),
  ];
  if (req.codeOwnerReview) lines.push(`Code owner review: ${REQUIRED}`);
  if (req.lastPushApproval) lines.push(`Last-push approval: ${REQUIRED}`);
  if (req.signedCommits) lines.push(`Signed commits: ${REQUIRED}`);
  if (req.linearHistory) lines.push(`Linear history: ${REQUIRED}`);
  if (req.branchUpToDate) {
    const value = req.branchUpToDate.current ? "Yes" : "No";
    lines.push(`Branch up to date: ${value} ${REQUIRED}`);
  }
  if (req.requiredStatusChecks) {
    const n = req.requiredStatusChecks.contexts.length;
    lines.push(`Required status checks: ${n} ${REQUIRED}`);
  }
  if (req.requiredDeployments) {
    const envs = req.requiredDeployments.environments.join(", ");
    lines.push(`Required deployments: ${envs} ${REQUIRED}`);
  }
  if (req.requiredWorkflows) lines.push(`Required workflows: ${REQUIRED}`);
  if (req.codeScanning) lines.push(`Code scanning: ${REQUIRED}`);
  if (req.mergeQueue) lines.push(formatMergeQueue(req.mergeQueue));
  if (req.stack) {
    const { number, position, size, baseRefName } = req.stack;
    lines.push(`Stack: #${number} ${position}/${size} (base ${baseRefName})`);
  }
  return lines;
}

export function blockedReasonFromRequirements(req: MergeRequirements | undefined): string | null {
  if (!req) return null;
  const unmet: string[] = [];
  if (req.approvals.requiredCount > 0 && req.approvals.current < req.approvals.requiredCount) {
    const need = req.approvals.requiredCount - req.approvals.current;
    unmet.push(`awaiting ${need} approval${need === 1 ? "" : "s"}`);
  }
  if (req.conversationsResolved.required && !req.conversationsResolved.resolved) {
    unmet.push("unresolved conversations are required");
  }
  if (req.branchUpToDate && !req.branchUpToDate.current) {
    unmet.push("branch is behind base");
  }
  if (req.mergeQueue?.inQueue) {
    const pos = req.mergeQueue.position != null ? ` position ${req.mergeQueue.position}` : "";
    unmet.push(`in merge queue${pos}`);
  } else if (req.mergeQueue?.required) {
    unmet.push("merge queue is required");
  }
  return unmet.length > 0 ? unmet.join("; ") : null;
}

function formatApprovals(current: number, requiredCount: number): string {
  const tag = requiredCount > 0 ? REQUIRED : NOT_REQUIRED;
  if (current === 0 && requiredCount === 0) return `Approvals: None ${NOT_REQUIRED}`;
  if (current === 0) return `Approvals: None ${REQUIRED}`;
  if (requiredCount > 0) return `Approvals: ${current}/${requiredCount} ${tag}`;
  return `Approvals: ${current} ${NOT_REQUIRED}`;
}

function formatConversations(c: MergeRequirements["conversationsResolved"]): string {
  const value = c.resolved ? "Yes" : "No";
  const tag = c.required ? REQUIRED : NOT_REQUIRED;
  return `Conversations Resolved: ${value} ${tag}`;
}

function formatMergeQueue(q: NonNullable<MergeRequirements["mergeQueue"]>): string {
  const tag = q.required ? REQUIRED : NOT_REQUIRED;
  if (q.inQueue) {
    const pos = q.position != null ? `position ${q.position}` : "Yes";
    const state = q.state ? ` ${q.state}` : "";
    return `Merge queue: ${pos}${state} ${tag}`;
  }
  if (q.required || q.enabled) return `Merge queue: No ${tag}`;
  return `Merge queue: No ${NOT_REQUIRED}`;
}
