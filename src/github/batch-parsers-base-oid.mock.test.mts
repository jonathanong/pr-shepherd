import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client.mts", () => ({
  graphql: vi.fn(),
  graphqlWithRateLimit: vi.fn(),
}));

import { fetchPrBatch } from "./batch.mts";
import { graphql, graphqlWithRateLimit } from "./client.mts";
import { BATCH_PR_QUERY } from "./queries.mts";

const mockGraphql = vi.mocked(graphql);
const mockGraphqlWithRateLimit = vi.mocked(graphqlWithRateLimit);

const REPO = { owner: "owner", name: "repo" };
const RECORDED_BASE = "a".repeat(40);
const emptyPage = { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] };

function makeRawPr(overrides: Record<string, unknown> = {}) {
  return {
    id: "PR_kgDOAAA",
    number: 42,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "c".repeat(40),
    headRefName: "feature",
    headRepository: { nameWithOwner: "owner/repo" },
    baseRefName: "main",
    reviewRequests: { nodes: [] },
    latestReviews: { nodes: [] },
    reviewThreads: emptyPage,
    comments: emptyPage,
    changesRequestedReviews: emptyPage,
    reviewSummaries: emptyPage,
    approvedReviews: emptyPage,
    commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
    ...overrides,
  };
}

function respondWith(pr: ReturnType<typeof makeRawPr>) {
  const response = { data: { repository: { pullRequest: pr } } };
  mockGraphql.mockResolvedValue(response);
  mockGraphqlWithRateLimit.mockResolvedValue(response);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchPrBatch — base OID", () => {
  // Ready receipts compare this OID with the compact summary's PR-level
  // baseRefOid. The base branch's live tip moves whenever the branch advances,
  // even though the PR's recorded base only moves when GitHub syncs the PR, so
  // a mismatch would make every stack receipt write fail.
  it("selects the PR's recorded base commit, not the base branch tip", () => {
    expect(BATCH_PR_QUERY).toContain("baseRefOid");
    expect(BATCH_PR_QUERY).not.toMatch(/target\s*\{\s*oid/);
  });

  it("reports the PR's recorded base commit", async () => {
    respondWith(makeRawPr({ baseRefOid: RECORDED_BASE }));

    const { data } = await fetchPrBatch(42, REPO);

    expect(data.baseRefOid).toBe(RECORDED_BASE);
  });

  it("omits the base OID when GitHub does not return one", async () => {
    respondWith(makeRawPr());

    const { data } = await fetchPrBatch(42, REPO);

    expect(data).not.toHaveProperty("baseRefOid");
  });
});

describe("fetchPrBatch — first-page reuse", () => {
  it("returns the reuse answer from the first page without paying for supplements", async () => {
    const pageInfo = { hasPreviousPage: true, startCursor: "older" };
    respondWith(makeRawPr({ comments: { pageInfo, nodes: [] } }));
    const reuse = vi.fn().mockResolvedValue("cached");

    const result = await fetchPrBatch(42, REPO, {}, reuse);

    expect(result).toEqual({ reused: "cached" });
    expect(reuse).toHaveBeenCalledWith(expect.objectContaining({ mergeStateStatus: "CLEAN" }));
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
  });

  it("continues the same request into a full snapshot when reuse declines", async () => {
    respondWith(makeRawPr({ baseRefOid: RECORDED_BASE }));
    const reuse = vi.fn().mockResolvedValue(null);

    const result = await fetchPrBatch(42, REPO, {}, reuse);

    expect(result).toMatchObject({ data: { baseRefOid: RECORDED_BASE }, fingerprint: {} });
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
  });
});
