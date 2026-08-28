/**
 * Projections for the agent-facing iterate output.
 *
 * These strip fields that are always-false by the time items reach iterate
 * (isResolved, isOutdated, isMinimized, createdAtUnix) and check metadata the
 * agent/iterate prompt never reads (event, status, category).
 * conclusion is preserved on AgentCheck so the formatter can branch on run-level conclusions.
 * detailsUrl is preserved in AgentCheck as a fallback for external status checks.
 * The original domain types are preserved as internal snapshot types.
 */

import { extractSuggestion } from "../suggestions/extract.mts";
import type {
  ReviewThread,
  PrComment,
  TriagedCheck,
  ClassifiedCheck,
  AgentThread,
  AgentComment,
  AgentCheck,
  AgentStalledCheck,
} from "../types.mts";

export function toAgentThread(t: ReviewThread): AgentThread {
  const suggestion = extractSuggestion(t) ?? undefined;
  return {
    id: t.id,
    ...(t.viewerCanReply === false && { viewerCanReply: false }),
    ...(t.viewerCanResolve === false && { viewerCanResolve: false }),
    ...(t.reviewId !== undefined && { reviewId: t.reviewId }),
    path: t.path,
    line: t.line,
    ...(t.line !== null &&
      t.startLine !== null &&
      t.startLine !== t.line && { startLine: t.startLine }),
    author: t.author,
    ...(t.authorType !== undefined && { authorType: t.authorType }),
    ...(t.authorAssociation !== undefined && { authorAssociation: t.authorAssociation }),
    ...(t.viewerDidAuthor === true && { viewerDidAuthor: true as const }),
    body: t.body,
    url: t.url,
    ...(t.edited === true && { edited: true }),
    ...(t.comments !== undefined && {
      comments: t.comments.map((c) => ({
        id: c.id,
        author: c.author,
        ...(c.authorType !== undefined && { authorType: c.authorType }),
        ...(c.authorAssociation !== undefined && { authorAssociation: c.authorAssociation }),
        ...(c.viewerDidAuthor === true && { viewerDidAuthor: true as const }),
        body: c.body,
        url: c.url,
      })),
    }),
    ...(suggestion !== undefined && { suggestion }),
  };
}

export function toAgentComment(c: PrComment & { edited?: boolean }): AgentComment {
  return {
    id: c.id,
    ...(c.viewerCanMinimize === false && { viewerCanMinimize: false }),
    author: c.author,
    ...(c.authorType !== undefined && { authorType: c.authorType }),
    ...(c.authorAssociation !== undefined && { authorAssociation: c.authorAssociation }),
    body: c.body,
    url: c.url,
    ...(c.edited === true && { edited: true }),
  };
}

export function toAgentCheck(c: TriagedCheck): AgentCheck {
  return {
    name: c.name,
    runId: c.runId,
    detailsUrl: c.detailsUrl,
    conclusion: c.conclusion,
    ...(c.workflowName !== undefined && { workflowName: c.workflowName }),
    ...(c.jobName !== undefined && { jobName: c.jobName }),
    ...(c.failedStep !== undefined && { failedStep: c.failedStep }),
    ...(c.summary !== undefined && { summary: c.summary }),
    ...(c.logExcerpt !== undefined && { logExcerpt: c.logExcerpt }),
    ...(c.annotations !== undefined && { annotations: c.annotations }),
    ...(c.scope !== undefined && { scope: c.scope }),
    ...(c.commitOid !== undefined && { commitOid: c.commitOid }),
  };
}

export function toAgentStalledCheck(c: ClassifiedCheck, nowSeconds: number): AgentStalledCheck {
  const createdAtUnix = c.createdAtUnix ?? nowSeconds;
  const activityAtUnix = c.updatedAtUnix ?? createdAtUnix;
  return {
    name: c.name,
    status: c.status,
    source: c.source ?? "check_run",
    runId: c.runId,
    detailsUrl: c.detailsUrl || null,
    ...(c.createdAtUnix !== undefined && { createdAtUnix: c.createdAtUnix }),
    ...(c.startedAtUnix !== undefined && { startedAtUnix: c.startedAtUnix }),
    ...(c.updatedAtUnix !== undefined && { updatedAtUnix: c.updatedAtUnix }),
    ageSeconds: Math.max(0, nowSeconds - activityAtUnix),
    ...(c.summary !== undefined && { summary: c.summary }),
  };
}

/**
 * Project failing checks for the agent. Deduplicates only null-runId external
 * checks by name — when runId is present each check may have a distinct job and
 * log tail, so they are all kept.
 */
export function toAgentChecks(checks: TriagedCheck[]): AgentCheck[] {
  const seenKeys = new Set<string>();
  const result: AgentCheck[] = [];
  for (const c of checks) {
    if (c.runId === null) {
      const key = `${c.scope ?? "pr"}:${c.commitOid ?? "head"}:${c.name}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
    }
    result.push(toAgentCheck(c));
  }
  return result;
}
