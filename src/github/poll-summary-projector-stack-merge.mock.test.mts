import { expect, it, vi } from "vitest";

vi.mock("../state/seen-comments.mts", () => ({
  loadSeenMap: vi.fn().mockResolvedValue(new Map()),
}));

import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const raw = {
  number: 42,
  title: "Widgets",
  url: "https://github.com/acme/widgets/pull/42",
  state: "OPEN",
  isDraft: false,
  viewerCanUpdate: true,
  headRefName: "widgets",
  headRefOid: "a".repeat(40),
  baseRefName: "main",
  baseRefOid: "b".repeat(40),
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  reviewDecision: null,
  isInMergeQueue: false,
  mergeQueueEntry: null,
  stack: { number: 7, size: 2, baseRefName: "main" },
  stackEntry: { position: 1 },
  comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
  reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
  reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
  commits: { nodes: [] },
} as RawSummaryPr;

it("keeps the authoritative one-PR command for a stack member in an explicit merge set", async () => {
  const item = await summarizePollSummaryPr(
    raw,
    { owner: "acme", name: "widgets" },
    {
      merge: true,
      readyDelaySeconds: 0,
    },
  );
  expect(item.action).toBe("fix_code");
  expect(item.reasons).toContain("authoritative-poll-required");
  expect(item.pollCommand).toContain("--until-terminal --merge");
});
