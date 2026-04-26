/**
 * Projections for the agent-facing iterate output.
 *
 * These strip fields that are always-false by the time items reach iterate
 * (isResolved, isOutdated, isMinimized, createdAtUnix) and check metadata the
 * monitor prompt never reads (event, status, conclusion, category).
 * detailsUrl is preserved in AgentCheck as a fallback for external status checks.
 * The original domain types are preserved for check command output.
 */

import { extractSuggestion } from "../suggestions/extract.mts";
import type {
  ReviewThread,
  PrComment,
  TriagedCheck,
  AgentThread,
  AgentComment,
  AgentCheck,
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
    body: t.body,
    url: t.url,
    ...(suggestion !== undefined && { suggestion }),
  };
}

export function toAgentComment(c: PrComment): AgentComment {
  return { id: c.id, author: c.author, body: c.body, url: c.url };
}

export function toAgentCheck(c: TriagedCheck): AgentCheck {
  return {
    name: c.name,
    runId: c.runId,
    detailsUrl: c.detailsUrl,
    ...(c.workflowName !== undefined && { workflowName: c.workflowName }),
    ...(c.jobName !== undefined && { jobName: c.jobName }),
    ...(c.failedStep !== undefined && { failedStep: c.failedStep }),
    ...(c.summary !== undefined && { summary: c.summary }),
    ...(c.logTail !== undefined && { logTail: c.logTail }),
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
