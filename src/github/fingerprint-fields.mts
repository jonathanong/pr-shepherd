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
