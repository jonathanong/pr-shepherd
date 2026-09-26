import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn().mockResolvedValue(new Map()) };
});
vi.mock("../state/ready-receipts.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/ready-receipts.mts")>();
  return { ...actual, readReadyReceipt: vi.fn() };
});

import { readReadyReceipt } from "../state/ready-receipts.mts";
import { graphqlWithRateLimit } from "./client.mts";
import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const repo = { owner: "acme", name: "widgets" };

function readyPr(): RawSummaryPr {
  return {
    number: 7,
    title: "Ready",
    url: "https://github.com/acme/widgets/pull/7",
    state: "OPEN",
    updatedAt: "2026-09-26T00:00:00Z",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "feature",
    headRefOid: "a".repeat(40),
    baseRefOid: "b".repeat(40),
    baseRefName: "main",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: true,
    mergeQueueEntry: null,
    commits: {
      nodes: [
        {
          commit: {
            oid: "c".repeat(40),
            statusCheckRollup: {
              contexts: {
                totalCount: 1,
                pageInfo: { hasPreviousPage: false },
                nodes: [
                  {
                    __typename: "CheckRun",
                    id: "CR1",
                    name: "ci",
                    status: "COMPLETED",
                    conclusion: "SUCCESS",
                    checkSuite: null,
                  },
                ],
              },
            },
          },
        },
      ],
    },
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
  } as unknown as RawSummaryPr;
}

beforeEach(() => vi.clearAllMocks());

describe("ready receipt when the annotation probe fails", () => {
  it("keeps the stored fingerprint for a queued layer", async () => {
    vi.mocked(readReadyReceipt).mockResolvedValue({
      version: 1,
      owner: repo.owner,
      repo: repo.name,
      pr: 7,
      headRefOid: "a".repeat(40),
      baseRefOid: "b".repeat(40),
      status: "READY",
      isDraft: false,
      readinessFingerprint: "stored",
      recordedAtUnix: 1,
    });
    mockGraphql.mockRejectedValue(new Error("resource limit"));
    const item = await summarizePollSummaryPr(readyPr(), repo, { stackPrNumber: 7, merge: true });
    expect(item.readyReceipt).toBe(true);
  });
});
