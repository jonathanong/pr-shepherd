import type { readRestStackMembership } from "./rest-stack-read.mts";
import type { readRestBranchRules } from "./rest-rules-read.mts";

/** Shared evidence belongs to one stack summary read, never to a later polling tick. */
export interface RestSnapshotContext {
  stack: Awaited<ReturnType<typeof readRestStackMembership>>;
  repository: Record<string, unknown>;
  readBranchRules(branch: string): ReturnType<typeof readRestBranchRules>;
  recordPullRevision(pr: number, revision: string): void;
}
