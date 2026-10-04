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
import { loadSeenMap } from "../state/seen-comments.mts";
import { graphqlWithRateLimit } from "./client.mts";
import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import { fingerprintRawSummaryPr } from "./poll-summary-fingerprint.mts";
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

describe("ready receipt with a compact conversation sample", () => {
  it.each([false, true])(
    "validates 20 of 76 conversations without fetching older threads (resolution required: %s)",
    async (required) => {
      const raw = readyPr();
      raw.isInMergeQueue = false;
      raw.baseRef = {
        branchProtectionRule: null,
        rules: {
          nodes: [
            { type: "PULL_REQUEST", parameters: { requiredReviewThreadResolution: required } },
          ],
        },
      };
      raw.commits.nodes[0]!.commit.statusCheckRollup!.contexts.nodes = [
        { __typename: "StatusContext", context: "ci", state: "SUCCESS" },
      ];
      raw.reviewThreads = {
        totalCount: 76,
        pageInfo: { hasPreviousPage: true },
        nodes: Array.from({ length: 20 }, (_, index) => ({
          id: `thread-${index}`,
          isResolved: true,
          isOutdated: false,
          path: "file.mts",
          comments: {
            totalCount: 1,
            pageInfo: { hasPreviousPage: false },
            nodes: [
              {
                id: `comment-${index}`,
                body: "Addressed feedback",
                isMinimized: false,
                author: { __typename: "User", login: "reviewer" },
              },
            ],
          },
        })),
      };
      vi.mocked(loadSeenMap).mockResolvedValue(
        new Map(raw.reviewThreads.nodes.map((thread) => [thread.id, { seenAt: 1 }])),
      );
      vi.mocked(readReadyReceipt).mockResolvedValue({
        version: 1,
        owner: repo.owner,
        repo: repo.name,
        pr: raw.number,
        headRefOid: raw.headRefOid,
        baseRefOid: raw.baseRefOid,
        status: "READY",
        isDraft: false,
        readinessFingerprint: fingerprintRawSummaryPr(raw)!,
        recordedAtUnix: 1,
      });

      const item = await summarizePollSummaryPr(raw, repo, { stackPrNumber: 7, merge: true });

      expect(item.readyReceipt).toBe(true);
      expect(item.review).toEqual({ threads: 76, incomplete: true });
      expect(mockGraphql).not.toHaveBeenCalled();
    },
  );
});
