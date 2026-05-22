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
    path: t.path,
    line: t.line,
    ...(t.line !== null &&
      t.startLine !== null &&
      t.startLine !== t.line && { startLine: t.startLine }),
    author: t.author,
    ...(t.authorType !== undefined && { authorType: t.authorType }),
    body: t.body,
    url: t.url,
    ...(t.comments !== undefined && {
      comments: t.comments.map((c) => ({
        id: c.id,
        author: c.author,
        ...(c.authorType !== undefined && { authorType: c.authorType }),
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
    author: c.author,
    ...(c.authorType !== undefined && { authorType: c.authorType }),
    body: c.body,
    url: c.url,
    ...(c.edited === true && { edited: true }),
  };
}

export function toAgentCheck(c: TriagedCheck): AgentCheck {
  if (c.conclusion === "SKIPPED" || c.conclusion === "NEUTRAL") {
    throw new Error(`Unexpected conclusion ${c.conclusion} in toAgentCheck`);
  }
  return {
    name: c.name,
    runId: c.runId,
    detailsUrl: c.detailsUrl,
    conclusion: c.conclusion,
    ...(c.workflowName !== undefined && { workflowName: c.workflowName }),
    ...(c.jobName !== undefined && { jobName: c.jobName }),
    ...(c.failedStep !== undefined && { failedStep: c.failedStep }),
    ...(c.summary !== undefined && { summary: c.summary }),
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
  const seenNames = new Set<string>();
  const result: AgentCheck[] = [];
  for (const c of checks) {
    if (c.runId === null) {
      if (seenNames.has(c.name)) continue;
      seenNames.add(c.name);
    }
    result.push(toAgentCheck(c));
  }
  return result;
}
