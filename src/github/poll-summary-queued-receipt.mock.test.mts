import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn().mockResolvedValue(new Map()) };
});
vi.mock("../state/ready-receipts.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/ready-receipts.mts")>();
  return { ...actual, readReadyReceipt: vi.fn() };
});

import { readReadyReceipt } from "../state/ready-receipts.mts";
import { fingerprintRawSummaryPr } from "./poll-summary-fingerprint.mts";
import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const repo = { owner: "acme", name: "widgets" };
const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };
const head = "a".repeat(40);
const base = "b".repeat(40);

function raw(overrides: Partial<RawSummaryPr> = {}): RawSummaryPr {
  return {
    number: 42,
    title: "Queued PR",
    url: "https://github.com/acme/widgets/pull/42",
    state: "OPEN",
    updatedAt: "2026-09-20T10:00:00Z",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "feature",
    headRefOid: head,
    baseRefName: "main",
    baseRefOid: base,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    isInMergeQueue: false,
    mergeQueueEntry: null,
    stack: { number: 7, size: 1, baseRefName: "main" },
    stackEntry: { position: 1 },
    comments: empty,
    reviews: empty,
    reviewThreads: empty,
    commits: { nodes: [] },
    ...overrides,
  };
}

function queueCheck(state: string): RawSummaryPr["mergeQueueEntry"] {
  return {
    headCommit: {
      statusCheckRollup: {
        contexts: {
          totalCount: 1,
          pageInfo: { hasPreviousPage: false },
          nodes: [{ __typename: "StatusContext", context: "merge-group", state }],
        },
      },
    },
  };
}

beforeEach(() => {
  vi.mocked(readReadyReceipt).mockReset();
  vi.mocked(readReadyReceipt).mockResolvedValue({
    version: 1,
    owner: repo.owner,
    repo: repo.name,
    pr: 42,
    headRefOid: head,
    baseRefOid: base,
    status: "READY",
    isDraft: false,
    readinessFingerprint: fingerprintRawSummaryPr(raw())!,
    recordedAtUnix: 1,
  });
});

describe("queued READY receipt projection", () => {
  it("retains a completed receipt while the merge-group check runs", async () => {
    const item = await summarizePollSummaryPr(
      raw({
        updatedAt: "2026-09-20T10:10:00Z",
        isInMergeQueue: true,
        mergeable: "UNKNOWN",
        mergeStateStatus: "BLOCKED",
        mergeQueueEntry: queueCheck("PENDING"),
      }),
      repo,
      { stackPrNumber: 42, merge: true },
    );
    expect(item).toMatchObject({
      readyReceipt: true,
      isInMergeQueue: true,
      checks: { inProgress: 1 },
    });
  });

  it("invalidates on a failing merge-group check", async () => {
    const item = await summarizePollSummaryPr(
      raw({ isInMergeQueue: true, mergeQueueEntry: queueCheck("FAILURE") }),
      repo,
      { stackPrNumber: 42, merge: true },
    );
    expect(item.readyReceipt).toBeUndefined();
    expect(item.checks?.failing).toBe(1);
  });

  it("invalidates on changed review evidence even while queued", async () => {
    const item = await summarizePollSummaryPr(
      raw({
        isInMergeQueue: true,
        mergeQueueEntry: queueCheck("PENDING"),
        reviewDecision: "CHANGES_REQUESTED",
      }),
      repo,
      { stackPrNumber: 42, merge: true },
    );
    expect(item.readyReceipt).toBeUndefined();
  });

  it("suppresses only the exact queue removal acknowledged by a current receipt", async () => {
    vi.mocked(readReadyReceipt).mockResolvedValue({
      version: 1,
      owner: repo.owner,
      repo: repo.name,
      pr: 42,
      headRefOid: head,
      baseRefOid: base,
      status: "READY",
      isDraft: false,
      readinessFingerprint: fingerprintRawSummaryPr(raw())!,
      acknowledgedQueueRemovalId: "removal-1",
      // Timestamp order is deliberately irrelevant; clocks can disagree.
      recordedAtUnix: 1,
    });
    const item = await summarizePollSummaryPr(
      raw({
        mergeQueueRemovals: {
          nodes: [
            {
              id: "removal-1",
              reason: "CI_FAILURE",
              createdAt: "2026-09-20T10:10:00Z",
              actor: { login: "github-merge-queue" },
              beforeCommit: {
                oid: "q".repeat(40),
                parents: { nodes: [{ oid: head }] },
              },
            },
          ],
        },
      }),
      repo,
      { stackPrNumber: 42, merge: true },
    );

    expect(item).toMatchObject({ readyReceipt: true });
    expect(item.queueRemoval).toBeUndefined();
  });

  it("does not suppress an unacknowledged removal based on receipt time", async () => {
    vi.mocked(readReadyReceipt).mockResolvedValue({
      version: 1,
      owner: repo.owner,
      repo: repo.name,
      pr: 42,
      headRefOid: head,
      baseRefOid: base,
      status: "READY",
      isDraft: false,
      readinessFingerprint: fingerprintRawSummaryPr(raw())!,
      recordedAtUnix: 2_000_000_000,
    });
    const item = await summarizePollSummaryPr(
      raw({
        mergeQueueRemovals: {
          nodes: [
            {
              id: "removal-2",
              reason: "CI_FAILURE",
              createdAt: "2026-09-20T10:10:00Z",
              actor: null,
              beforeCommit: { oid: "q".repeat(40), parents: { nodes: [{ oid: head }] } },
            },
          ],
        },
      }),
      repo,
      { stackPrNumber: 42, merge: true },
    );
    expect(item.queueRemoval?.reason).toBe("CI_FAILURE");
  });
});
