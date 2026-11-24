/**
 * What a read could not see because GitHub returned `null` in place of a connection node
 * (seen right after a push, with no GraphQL error). Internal only: it gates readiness and
 * reuse and is never printed.
 */
export interface UnreadNodes {
  /** A check context, commit or queue entry was unreadable: CI state is not fully known. */
  checks?: true;
  /** A review thread, comment, review or rule was unreadable: feedback is not fully known. */
  feedback?: true;
}

/** Connections whose nodes only describe history; a null there changes no decision. */
const INFORMATIONAL = new Set([
  "parents",
  "mergeQueueRemovalTimes",
  "headRefForcePushes",
  "prCommitOids",
]);
/** Keys that put the connections under them on the CI side of the split. */
const CHECK_KEYS = new Set(["commits", "statusCheckRollup", "contexts", "checkSuites"]);

function hasNullComment(thread: unknown): boolean {
  const comments = (thread as { comments?: { nodes?: unknown[] } }).comments?.nodes;
  return comments?.includes(null) === true;
}

function tidyConnection(
  connection: { nodes: unknown[]; pageInfo?: object },
  key: string,
  inChecks: boolean,
  found: UnreadNodes,
): void {
  let kept = connection.nodes.filter((node) => node !== null);
  // A thread missing one comment would hash a partial transcript and could point replies at the
  // wrong root, so the whole thread counts as unread.
  if (key === "reviewThreads") kept = kept.filter((thread) => !hasNullComment(thread));
  if (kept.length === connection.nodes.length) return;
  connection.nodes = kept;
  // Consumers already treat an unread suite page as unverified.
  if (key === "checkSuites") connection.pageInfo = { ...connection.pageInfo, hasNextPage: true };
  if (!INFORMATIONAL.has(key)) found[inChecks ? "checks" : "feedback"] = true;
}

function visit(value: unknown, key: string, inChecks: boolean, found: UnreadNodes): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, key, inChecks, found);
    return;
  }
  // Inline annotation nulls mean "read the annotations separately" and are handled there.
  if (typeof value !== "object" || value === null || key === "annotations") return;
  const record = value as Record<string, unknown>;
  const checks = inChecks || CHECK_KEYS.has(key);
  if (Array.isArray(record["nodes"])) {
    tidyConnection(record as { nodes: unknown[] }, key, checks, found);
  }
  for (const [child, node] of Object.entries(record)) visit(node, child, checks, found);
}

/**
 * Remove `null` from every connection under `root`, in place, so no later reader dereferences
 * one. Returns what was unreadable, or undefined when nothing was. Never use this on a root
 * `nodes(ids: ...)` lookup, where null is the meaningful "not found" answer.
 */
export function dropNullNodes(root: object | null | undefined): UnreadNodes | undefined {
  if (!root) return undefined;
  const found: UnreadNodes = {};
  visit(root, "", false, found);
  return found.checks || found.feedback ? found : undefined;
}

/** The union of several reads' unreadable parts. */
export function mergeUnread(...parts: Array<UnreadNodes | undefined>): UnreadNodes | undefined {
  const merged: UnreadNodes = {};
  for (const part of parts) {
    if (part?.checks) merged.checks = true;
    if (part?.feedback) merged.feedback = true;
  }
  return merged.checks || merged.feedback ? merged : undefined;
}
