/**
 * Projections for the agent-facing iterate output.
 *
 * These strip fields that are always-false by the time items reach iterate
 * (isResolved, isOutdated, isMinimized, createdAtUnix) and metadata that the
 * monitor prompt never reads (detailsUrl, event, status, conclusion, category,
 * logExcerpt). The original domain types are preserved for check command output.
 */

import type {
  ReviewThread,
  PrComment,
  TriagedCheck,
  AgentThread,
  AgentComment,
  AgentCheck,
} from "../types.mts";

export function toAgentThread(t: ReviewThread): AgentThread {
  return { id: t.id, path: t.path, line: t.line, author: t.author, body: t.body };
}

export function toAgentComment(c: PrComment): AgentComment {
  return { id: c.id, author: c.author, body: c.body };
}

export function toAgentCheck(c: TriagedCheck): AgentCheck {
  return { name: c.name, runId: c.runId, failureKind: c.failureKind };
}

/**
 * Project and deduplicate checks by runId so the agent makes one
 * `gh run view` call per run rather than one per matrix step.
 */
export function toAgentChecks(checks: TriagedCheck[]): AgentCheck[] {
  const seen = new Set<string>();
  const result: AgentCheck[] = [];
  for (const c of checks) {
    if (c.runId !== null) {
      if (seen.has(c.runId)) continue;
      seen.add(c.runId);
    }
    result.push(toAgentCheck(c));
  }
  return result;
}
