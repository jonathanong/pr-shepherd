import { parseBranchRules } from "./batch-parsers-rules.mts";
import type { RawBaseRef } from "./batch-raw-rules.mts";

export interface FingerprintSuites {
  pageInfo?: { hasNextPage: boolean };
  nodes?: Array<{
    id?: string;
    conclusion: string | null;
    workflowRun?: { databaseId: number | null } | null;
  }>;
}

export interface FingerprintComment {
  id: string;
  updatedAt?: string;
}

export function suiteFingerprint(suites: FingerprintSuites | undefined): {
  checkSuiteConclusions: string;
  checkSuitesComplete: boolean;
} {
  if (suites === undefined) return { checkSuiteConclusions: "", checkSuitesComplete: false };
  return {
    checkSuiteConclusions: (suites.nodes ?? [])
      .map((node) => `${node.id ?? node.workflowRun?.databaseId ?? ""}:${node.conclusion ?? ""}`)
      .join(","),
    checkSuitesComplete: suites.pageInfo?.hasNextPage === false,
  };
}

export function mergePolicyFingerprint(raw: {
  isMergeQueueEnabled?: boolean;
  baseRef?: RawBaseRef | null;
}): string {
  return JSON.stringify({
    isMergeQueueEnabled: Boolean(raw.isMergeQueueEnabled),
    rules: parseBranchRules(raw.baseRef),
  });
}

export function commentRevisions(nodes: FingerprintComment[]): string {
  return nodes.map((node) => `${node.id}:${node.updatedAt ?? ""}`).join(",");
}

export function threadCommentRevisions(
  nodes: Array<{
    id: string;
    comments?: { totalCount?: number; nodes: Array<{ id: string; updatedAt?: string }> };
  }>,
): string {
  return nodes
    .map((thread) => {
      const last = thread.comments?.nodes.at(-1);
      return `${thread.id}:${last?.id ?? ""}:${last?.updatedAt ?? ""}`;
    })
    .join(",");
}

export function hasMultiCommentThreads(
  nodes: Array<{ comments?: { totalCount?: number } }>,
): boolean {
  return nodes.some((thread) => (thread.comments?.totalCount ?? 0) > 1);
}

export function rulesComplete(
  baseRef?: {
    rules?: { pageInfo?: { hasNextPage: boolean } } | null;
  } | null,
): boolean {
  return baseRef?.rules?.pageInfo?.hasNextPage !== true;
}

export function stackKey(raw: {
  stack?: { number: number; size: number; baseRefName: string } | null;
  stackEntry?: { position: number } | null;
}): string {
  if (!raw.stack) return "";
  return `${raw.stack.number}:${raw.stack.size}:${raw.stackEntry?.position ?? 0}:${raw.stack.baseRefName}`;
}
