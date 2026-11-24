import { describe, expect, it } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

const page = { hasPreviousPage: false, startCursor: null, hasNextPage: false, endCursor: null };
const comment = (id: string) => ({
  id,
  isMinimized: false,
  author: { login: "reviewer", __typename: "User" },
  body: `body ${id}`,
  url: `https://example.test/${id}`,
  createdAt: "2026-10-01T00:00:00Z",
});
const review = (id: string) => ({ ...comment(id), state: "COMMENTED" });
const context = {
  __typename: "StatusContext",
  context: "ci",
  state: "SUCCESS",
  targetUrl: null,
  description: null,
};

type Doc = Record<string, unknown>;

/** One representative item in every connection under the pull request. */
function populated(): ReturnType<typeof makeRawPr> {
  return makeRawPr({
    reviewRequests: { nodes: [{ requestedReviewer: { login: "alice" } }] },
    latestReviews: { nodes: [{ state: "APPROVED", author: { login: "alice" } }] },
    reviewThreads: {
      pageInfo: page,
      nodes: [
        {
          id: "t1",
          isResolved: false,
          isOutdated: false,
          path: "a.ts",
          line: 1,
          comments: { pageInfo: page, nodes: [comment("tc1"), comment("tc2")] },
        },
      ],
    },
    comments: { pageInfo: page, nodes: [comment("c1")] },
    changesRequestedReviews: { pageInfo: page, nodes: [review("r1")] },
    reviewSummaries: { pageInfo: page, nodes: [review("r2")] },
    approvedReviews: { pageInfo: page, nodes: [review("r3")] },
    prCommitOids: { nodes: [{ commit: { oid: "o1" } }] },
    headRefForcePushes: { nodes: [{ createdAt: "2026-10-01T00:00:00Z" }] },
    mergeQueueRemovalTimes: { nodes: [{ createdAt: "2026-10-01T00:00:00Z" }] },
    commits: {
      nodes: [
        {
          commit: {
            oid: "c".repeat(40),
            checkSuites: { pageInfo: page, nodes: [{ createdAt: "2026-10-01T00:00:00Z" }] },
            statusCheckRollup: { contexts: { pageInfo: page, nodes: [context] } },
          },
        },
      ],
    },
  });
}

const HISTORY_ONLY = new Set(["prCommitOids", "headRefForcePushes", "mergeQueueRemovalTimes"]);

type Path = Array<string | number>;

/** Every `nodes` array in the document, as a path of keys. */
function connectionPaths(value: unknown, path: Path = []): Path[] {
  if (typeof value !== "object" || value === null) return [];
  const own: Path[] = Array.isArray((value as Doc)["nodes"]) ? [[...path, "nodes"]] : [];
  return [
    ...own,
    ...Object.entries(value).flatMap(([key, child]) =>
      connectionPaths(child, [...path, Array.isArray(value) ? Number(key) : key]),
    ),
  ];
}

function injectNull(doc: object, path: Path): void {
  let node: unknown = doc;
  for (const key of path) node = (node as Doc)[key];
  (node as unknown[]).unshift(null);
}

describe("fetchPrBatch with a null in any connection", () => {
  const paths = connectionPaths(populated());

  it("finds the connections it is meant to cover", () => {
    expect(paths.length).toBeGreaterThanOrEqual(12);
  });

  it.each(paths.map((path) => [path.join("."), path] as const))(
    "survives a null in %s without losing the unreadable signal",
    async (_label, path) => {
      const pr = populated();
      injectNull(pr, path);
      mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));

      const { data, fingerprint } = await fetchPrBatch(42, REPO);

      if (HISTORY_ONLY.has(String(path.at(-2)))) {
        expect(data.unreadNodes).toBeUndefined();
        return;
      }
      expect(data.unreadNodes).toBeDefined();
      expect(fingerprint).toBeUndefined();
    },
  );

  it("reports no unread nodes when nothing is null", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(populated()));
    const { data, fingerprint } = await fetchPrBatch(42, REPO);
    expect(data.unreadNodes).toBeUndefined();
    expect(fingerprint).toBeDefined();
  });

  it("withholds a thread with a null comment rather than reporting it absent", async () => {
    const pr = populated();
    injectNull(pr, ["reviewThreads", "nodes", 0, "comments", "nodes"]);
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));

    const { data } = await fetchPrBatch(42, REPO);

    expect(data.reviewThreads).toEqual([]);
    expect(data.unreadNodes).toEqual({ feedback: true });
  });
});
