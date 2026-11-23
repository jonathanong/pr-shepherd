import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client.mts", () => ({
  graphql: vi.fn(),
  graphqlWithRateLimit: vi.fn(),
}));

import { fetchPrBatch } from "./batch.mts";
import { graphql, graphqlWithRateLimit } from "./client.mts";
import { makeRawPr } from "../../test-helpers/github/batch-fixtures.mts";

const REPO = { owner: "owner", name: "repo" };
const unix = (iso: string) => Date.parse(iso) / 1000;

function respondWith(pr: ReturnType<typeof makeRawPr>) {
  const response = { data: { repository: { pullRequest: pr } } };
  vi.mocked(graphql).mockResolvedValue(response);
  vi.mocked(graphqlWithRateLimit).mockResolvedValue(response);
}

const suites = (...createdAts: Array<string | undefined>) => ({
  pageInfo: { hasNextPage: false },
  nodes: createdAts.map((createdAt, i) => ({
    id: `CS_${i}`,
    ...(createdAt && { createdAt }),
    status: "QUEUED",
    conclusion: null,
    app: { slug: "codecov" },
    workflowRun: null,
  })),
});

const withSuites = (...createdAts: Array<string | undefined>) =>
  makeRawPr({
    commits: {
      totalCount: 1,
      nodes: [{ commit: { statusCheckRollup: null, checkSuites: suites(...createdAts) } }],
    },
  });

beforeEach(() => vi.clearAllMocks());

describe("fetchPrBatch headFreshAtUnix (issue 815)", () => {
  it("is the newest third-party suite time when no check run exists yet", async () => {
    respondWith(withSuites("2026-08-27T05:09:04Z", "2026-08-27T05:09:06Z", undefined));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.headFreshAtUnix).toBe(unix("2026-08-27T05:09:06Z"));
  });

  it("falls back to the PR's creation, and a later force-push wins", async () => {
    respondWith({ ...withSuites(), createdAt: "2026-08-27T05:00:00Z" } as never);
    expect((await fetchPrBatch(42, REPO)).data.headFreshAtUnix).toBe(unix("2026-08-27T05:00:00Z"));

    respondWith({
      ...withSuites(),
      createdAt: "2026-08-27T05:00:00Z",
      headRefForcePushes: { nodes: [{ createdAt: "2026-08-27T06:00:00Z" }] },
    } as never);
    expect((await fetchPrBatch(42, REPO)).data.headFreshAtUnix).toBe(unix("2026-08-27T06:00:00Z"));
  });

  it("is omitted when no signal is known", async () => {
    respondWith(withSuites());
    expect((await fetchPrBatch(42, REPO)).data).not.toHaveProperty("headFreshAtUnix");
  });
});
