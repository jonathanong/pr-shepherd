import { describe, expect, it } from "vitest";
import { currentQueueRemovalEvent } from "./poll-summary-queue-removal.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const removal = {
  id: "removal-1",
  reason: "CI_FAILURE",
  createdAt: "2026-09-20T10:10:00Z",
  actor: null,
  beforeCommit: { oid: "queue-head", parents: { nodes: [{ oid: "pr-head" }] } },
};

function raw(overrides: Partial<RawSummaryPr> = {}): RawSummaryPr {
  return {
    headRefOid: "pr-head",
    isInMergeQueue: false,
    mergeQueueAdditions: { nodes: [{ createdAt: "2026-09-20T10:00:00Z" }] },
    mergeQueueRemovals: { nodes: [removal] },
    ...overrides,
  } as RawSummaryPr;
}

describe("currentQueueRemovalEvent", () => {
  it("returns a removal tied to the current PR head", () => {
    expect(currentQueueRemovalEvent(raw())).toEqual(removal);
  });

  it.each([
    ["no removal", { mergeQueueRemovals: { nodes: [] } }],
    ["already requeued", { isInMergeQueue: true }],
    ["invalid time", { mergeQueueRemovals: { nodes: [{ ...removal, createdAt: "invalid" }] } }],
    ["newer addition", { mergeQueueAdditions: { nodes: [{ createdAt: "2026-09-20T10:20:00Z" }] } }],
    ["different head", { headRefOid: "other-head" }],
    ["unknown parents", { mergeQueueRemovals: { nodes: [{ ...removal, beforeCommit: null }] } }],
  ])("rejects %s", (_case, changes) => {
    expect(currentQueueRemovalEvent(raw(changes as Partial<RawSummaryPr>))).toBeNull();
  });
});
