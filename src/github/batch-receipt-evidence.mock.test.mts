import { beforeEach, describe, expect, it, vi } from "vitest";
const mockGraphql = vi.hoisted(() => vi.fn());
vi.mock("./client.mts", () => ({ graphqlWithRateLimit: mockGraphql }));
import { makeRawPr } from "../../test-helpers/github/batch-fixtures.mts";
import { prepareBatchReceiptEvidence } from "./batch-receipt-evidence.mts";
import { hydrateReadyAnnotationProbe } from "./poll-summary-annotation-probe.mts";
import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { fingerprintRawSummaryPr } from "./poll-summary-fingerprint.mts";
import type { RawContextNode, RawPr } from "./batch-raw-types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const repo = { owner: "owner", name: "repo" };
const check = {
  __typename: "CheckRun" as const,
  id: "check-1",
  name: "CI",
  status: "COMPLETED",
  conclusion: "SUCCESS",
  checkSuite: null,
};

function summary(nodes: object[] = [check], hasPreviousPage = false): RawSummaryPr {
  return {
    number: 42,
    state: "OPEN",
    updatedAt: "2026-01-01T00:00:00Z",
    isDraft: false,
    headRefName: "feature",
    headRefOid: "head-1",
    baseRefName: "main",
    baseRefOid: "base-1",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    isInMergeQueue: false,
    mergeQueueEntry: null,
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    commits: {
      nodes: [
        {
          commit: {
            oid: "head-1",
            statusCheckRollup: {
              contexts: {
                totalCount: nodes.length,
                pageInfo: { hasPreviousPage, startCursor: hasPreviousPage ? "older" : null },
                nodes,
              },
            },
          },
        },
      ],
    },
  } as unknown as RawSummaryPr;
}

function batch(): RawPr {
  return makeRawPr({
    headRefOid: "head-1",
    baseRefOid: "base-1",
    commits: {
      nodes: [{ commit: { oid: "head-1", statusCheckRollup: { contexts: { nodes: [] } } } }],
    },
  }) as unknown as RawPr;
}

const batchCheck = (id = "check-1", totalCount?: number): RawContextNode =>
  ({
    __typename: "CheckRun",
    id,
    annotations: { totalCount, nodes: [] },
  }) as unknown as RawContextNode;

beforeEach(() => {
  mockGraphql.mockReset();
  mockGraphql.mockResolvedValue({
    data: {
      repository: {
        object: {
          __typename: "Commit",
          oid: "head-1",
          statusCheckRollup: {
            contexts: {
              pageInfo: { hasPreviousPage: false },
              nodes: [{ __typename: "CheckRun", id: "check-1", annotations: { totalCount: 2 } }],
            },
          },
        },
      },
    },
  });
});

describe("same-request READY receipt evidence", () => {
  it("preserves the exact v1 fingerprint of the standalone summary and annotation probe", async () => {
    const original = summary();
    await hydratePollSummaryChecks(original, repo);
    await hydrateReadyAnnotationProbe(original, repo, {});
    expect(mockGraphql).toHaveBeenCalledTimes(1);

    const checks = [batchCheck("check-1", 2)];
    const candidate = await prepareBatchReceiptEvidence(summary(), batch(), checks, repo);
    expect(candidate).not.toBeNull();
    expect(candidate?.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes[0]).toHaveProperty(
      "annotations",
      { totalCount: 2 },
    );
    expect(fingerprintRawSummaryPr(candidate!)).toBe(fingerprintRawSummaryPr(original));
    await hydrateReadyAnnotationProbe(candidate!, repo, {});
    expect(mockGraphql).toHaveBeenCalledTimes(1);
  });

  it("preserves v1 evidence when the commit has no CheckRuns", async () => {
    const original = summary([]);
    await hydratePollSummaryChecks(original, repo);
    await hydrateReadyAnnotationProbe(original, repo, {});
    const candidate = await prepareBatchReceiptEvidence(summary([]), batch(), [], repo);
    expect(fingerprintRawSummaryPr(candidate!)).toBe(fingerprintRawSummaryPr(original));
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("keeps StatusContext-only fingerprints identical without a probe", async () => {
    const status = { __typename: "StatusContext", context: "lint", state: "SUCCESS" };
    const original = summary([status]);
    await hydratePollSummaryChecks(original, repo);
    await hydrateReadyAnnotationProbe(original, repo, {});
    const candidate = await prepareBatchReceiptEvidence(
      summary([status]),
      batch(),
      [status as RawContextNode],
      repo,
    );
    expect(fingerprintRawSummaryPr(candidate!)).toBe(fingerprintRawSummaryPr(original));
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("keeps null-rollup fingerprints identical without a probe", async () => {
    const original = summary([]);
    original.commits.nodes[0]!.commit.statusCheckRollup = null;
    const candidateRaw = summary([]);
    candidateRaw.commits.nodes[0]!.commit.statusCheckRollup = null;
    const source = batch();
    source.commits.nodes[0]!.commit.statusCheckRollup = null;
    await hydratePollSummaryChecks(original, repo);
    await hydrateReadyAnnotationProbe(original, repo, {});
    const candidate = await prepareBatchReceiptEvidence(candidateRaw, source, [], repo);
    expect(fingerprintRawSummaryPr(candidate!)).toBe(fingerprintRawSummaryPr(original));
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("falls back without fetching extra pages when the summary window exceeds 100 contexts", async () => {
    const checks = [batchCheck("check-1", 2)];
    const candidate = await prepareBatchReceiptEvidence(
      summary([check], true),
      batch(),
      checks,
      repo,
    );
    expect(candidate).toBeNull();
    expect(mockGraphql).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "rejects a short first-page summary for head or queue even without an older page (%s)",
    async (queue) => {
      const candidate = summary();
      const commit = structuredClone(candidate.commits.nodes[0]!.commit);
      if (queue) candidate.mergeQueueEntry = { headCommit: commit };
      else candidate.commits.nodes[0]!.commit = commit;
      commit.statusCheckRollup!.contexts.totalCount = 2;
      expect(
        await prepareBatchReceiptEvidence(candidate, batch(), [batchCheck("check-1", 2)], repo),
      ).toBeNull();
      expect(mockGraphql).not.toHaveBeenCalled();
    },
  );
  it("treats malformed optional summary hydration as missing evidence", async () => {
    const candidate = summary();
    Object.defineProperty(candidate.commits.nodes[0]!.commit.statusCheckRollup!.contexts, "nodes", {
      get: () => {
        throw new Error("malformed summary nodes");
      },
    });
    expect(
      await prepareBatchReceiptEvidence(candidate, batch(), [batchCheck("check-1", 2)], repo),
    ).toBeNull();
  });
  it.each([
    ["missing count", [batchCheck()]],
    ["wrong ID", [batchCheck("other", 2)]],
  ])("falls back on %s", async (_name, checks) => {
    expect(await prepareBatchReceiptEvidence(summary(), batch(), checks, repo)).toBeNull();
  });

  it("rejects duplicated summary CheckRun IDs even when the batch has the same count", async () => {
    const nodes = [check, check];
    const checks = [batchCheck("check-1", 1), batchCheck("check-2", 1)];
    expect(await prepareBatchReceiptEvidence(summary(nodes), batch(), checks, repo)).toBeNull();
  });
});
