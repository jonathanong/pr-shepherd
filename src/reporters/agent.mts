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
  return {
    name: c.name,
    runId: c.runId,
    detailsUrl: c.detailsUrl,
    failureKind: c.failureKind,
    failedStep: c.failedStep,
  };
}

/**
 * Project and deduplicate checks so the agent makes one `gh run view` call
 * per run (dedup by runId) and skips duplicate external status checks (dedup
 * by name when runId is null).
 */
export function toAgentChecks(checks: TriagedCheck[]): AgentCheck[] {
  const seenRunIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: AgentCheck[] = [];
  for (const c of checks) {
    if (c.runId !== null) {
      if (seenRunIds.has(c.runId)) continue;
      seenRunIds.add(c.runId);
    } else {
      if (seenNames.has(c.name)) continue;
      seenNames.add(c.name);
    }
    result.push(toAgentCheck(c));
  }
  return result;
}
