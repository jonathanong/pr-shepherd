import type { RepoInfo } from "../github/client.mts";
import { readStackTopology } from "../github/stack-read.mts";
import type { BatchStackEvidence, TrunkRules } from "../github/batch-stack-evidence.mts";
import type { RawSummaryPr } from "../github/poll-summary-raw.mts";
import { readReadyReceipt } from "../state/ready-receipts.mts";
import { readyDelayElapsed } from "./ready-delay.mts";

/** Fresh for each iterate tick; never persisted or exposed in CLI output. */
export function createCheckExecutionContext(readyDelaySeconds?: number) {
  const topologies = new Map<string, ReturnType<typeof readStackTopology>>();
  const trunks = new Map<string, TrunkRules>();
  const keyOf = (pr: number, repo: RepoInfo) =>
    `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}#${pr}`;
  let receiptSummary: RawSummaryPr | null = null;
  let receiptSummaryInvalidated = false;
  return {
    readStackTopology(pr: number, repo: RepoInfo): ReturnType<typeof readStackTopology> {
      const key = keyOf(pr, repo);
      let pending = topologies.get(key);
      if (!pending) {
        pending = readStackTopology(pr, repo);
        topologies.set(key, pending);
      }
      return pending;
    },
    /** Adopt the stack reads that this tick's `BatchPr` first page already answered. */
    seedStack(pr: number, repo: RepoInfo, evidence: BatchStackEvidence): void {
      const key = keyOf(pr, repo);
      if (evidence.topology) topologies.set(key, Promise.resolve(evidence.topology));
      if (evidence.trunk) trunks.set(key, evidence.trunk);
    },
    /** Trunk rules from this tick's `BatchPr`, only when they are for `refName`. */
    trunkRules(pr: number, repo: RepoInfo, refName: string): TrunkRules | undefined {
      const trunk = trunks.get(keyOf(pr, repo));
      return trunk?.refName === refName ? trunk : undefined;
    },
    async wantsReceiptSummary(pr: number, repo: RepoInfo): Promise<boolean> {
      if (readyDelaySeconds === undefined) return false;
      const key = { owner: repo.owner, repo: repo.name, pr };
      if (await readReadyReceipt(key)) return true;
      return readyDelayElapsed(pr, repo.owner, repo.name, readyDelaySeconds);
    },
    setReceiptSummary(raw: RawSummaryPr | null): void {
      receiptSummary = raw;
    },
    getReceiptSummary(): RawSummaryPr | null {
      return receiptSummaryInvalidated ? null : receiptSummary;
    },
    invalidateReceiptSummary(): void {
      receiptSummaryInvalidated = true;
      receiptSummary = null;
    },
  };
}

export type CheckExecutionContext = ReturnType<typeof createCheckExecutionContext>;
